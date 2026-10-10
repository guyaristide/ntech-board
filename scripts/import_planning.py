"""Importe le programme des ateliers depuis le planning Excel (lecture seule) vers data/seed/workshops.json.

Usage : python3 scripts/import_planning.py [chemin du planning .xlsx]
"""
import json, re, sys, warnings
from pathlib import Path
import openpyxl

warnings.filterwarnings('ignore')
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else
           '/Users/neiba/myspace/clients/cybastion/Planning_ateliers_cadrage_a_valider.xlsx')
OUT = Path(__file__).resolve().parent.parent / 'data' / 'seed' / 'workshops.json'
CODE = re.compile(r'^((J\d+)\.\d+|(C\d))\s+(.*)$', re.S)


def clean(s):
    if s is None: return ''
    s = str(s).replace('–', '-').replace('—', '-').replace('\xa0', ' ')
    return re.sub(r'[ \t]+', ' ', s).strip()


def bullets(s):
    out = []
    for line in str(s or '').split('\n'):
        line = clean(re.sub(r'^\s*[•\-]\s*', '', line))
        if line: out.append(line)
    return out


def times(s):
    m = re.findall(r'(\d{2}):(\d{2})', s or '')
    return (f'{m[0][0]}:{m[0][1]}', f'{m[1][0]}:{m[1][1]}') if len(m) >= 2 else (None, None)


def iso(x):
    return x.strftime('%Y-%m-%d') if hasattr(x, 'strftime') else None


wb = openpyxl.load_workbook(SRC, data_only=True)

# Fiches « Références CdC » : ce que dit le cahier des charges, par sujet, et les séquences concernées.
references = []
if 'Références CdC' in wb.sheetnames:
    for row in wb['Références CdC'].iter_rows(min_row=1, values_only=True):
        ref = clean(row[0])
        if not re.fullmatch(r'R\d+', ref): continue
        references.append({
            'id': ref, 'subject': clean(row[1]), 'says': bullets(row[2]), 'where': clean(row[3]),
            'gaps': '' if clean(row[4]) in ('', '-') else clean(row[4]),
            'sessions': re.findall(r'\b(?:J\d+\.\d+|C\d)\b', clean(row[5])),
        })

ws = wb['Planning']
blocks, block, session, phase = [], None, None, ''
for row in ws.iter_rows(min_row=2, values_only=True):
    a, b, c, d, e, f, g = (list(row) + [None] * 7)[:7]
    if all(x is None for x in row): continue
    A, B = clean(a), clean(b)
    if A == 'Horaire': continue
    if b is None and c is None and a is not None:
        text = str(a)
        first = clean(text.split('\n')[0])
        if first.startswith(('SEMAINE', 'Après')):
            phase = first
        elif block is None and not re.match(r'^(J\d+|C\d)', first):
            continue  # titre et chapeau du planning
        elif text.startswith('Objectifs'):
            block['objectives'] = bullets(text.split(':', 1)[1])
        elif text.startswith(('Questionnaire', 'RACI', 'Risques')):
            for line in text.split('\n'):
                line = clean(line)
                if line.startswith('Questionnaire'): block['questionnaire'] = line.split(':', 1)[1].strip()
                elif line.startswith('RACI'): block['raci'].append(line.split('·', 1)[1].strip())
                elif line.startswith('Risques'): block['risks'] = [clean(r) for r in line.split(':', 1)[1].split('·')]
        elif text.startswith('Livrable'):
            block['deliverable'] = clean(text.split(':', 1)[1])
        elif text.startswith(('PV ', 'Un PV')):
            block['pv'] = clean(text)
        else:
            block = {'header': first, 'phase': phase, 'objectives': [], 'questionnaire': '', 'raci': [], 'risks': [],
                     'deliverable': '', 'pv': '', 'sessions': [], 'agenda': []}
            blocks.append(block)
        continue
    if block is None: continue
    if B.startswith('›'):
        start, end = times(A)
        m = re.search(r'\((\d+) min\)\s*$', B)
        session['steps'].append({'start': start, 'end': end, 'title': clean(re.sub(r'\(\d+ min\)\s*$', '', B[1:])),
                                 'minutes': int(m.group(1)) if m else None})
        continue
    m = CODE.match(B)
    start, end = times(A)
    if m:
        title = m.group(4)
        session = {'code': m.group(1), 'atelier': m.group(2) or m.group(3), 'start': start, 'end': end,
                   'allDay': 'Journée' in A, 'title': clean(title.replace('Séquence ajoutée', '')), 'content': clean(c),
                   'owner': clean(d), 'outcome': clean(e), 'questions': bullets(f), 'added': 'Séquence ajoutée' in title,
                   'cdc': clean(g).lstrip('→').strip(), 'refs': [], 'steps': []}
        block['sessions'].append(session)
        block['agenda'].append({'kind': 'session', 'code': session['code']})
    elif B:
        block['agenda'].append({'kind': 'break', 'start': start, 'end': end, 'title': B})

for blk in blocks:
    for s in blk['sessions']:
        s['refs'] = [r['id'] for r in references if s['code'] in r['sessions']]

# Dates, thèmes et questionnaires depuis l'onglet de suivi des PV
pv, prep = {}, {}
for row in wb['Suivi des PV'].iter_rows(min_row=2, values_only=True):
    k = clean(row[0])
    if re.fullmatch(r'J\d+|C\d', k) and k not in pv and (row[2] is None or hasattr(row[2], 'strftime')) and not str(row[1] or '').startswith('A'):
        pv[k] = {'theme': clean(row[1]), 'date': iso(row[2]), 'pvDue': iso(row[3]), 'deliverableDue': iso(row[4]),
                 'validationDue': iso(row[5]), 'pvStatus': clean(row[6])}
    elif k and str(row[1] or '').startswith('A') and hasattr(row[2], 'strftime'):
        for key in re.findall(r'J\d+', k):
            prep.setdefault(key, []).append({'tab': clean(row[1]), 'due': iso(row[2]), 'questions': int(row[3] or 0),
                                             'status': clean(row[6])})

ateliers = []
for blk in blocks:
    if not blk['sessions']: continue
    if blk['sessions'][0]['atelier'].startswith('C'):
        for i, s in enumerate(blk['sessions']):
            info = pv.get(s['atelier'], {})
            ateliers.append({'id': s['atelier'], 'title': info.get('theme') or s['title'], 'phase': blk['phase'] or blk['header'],
                             'objectives': blk['objectives'] if i == 0 else [], 'questionnaire': '', 'raci': blk['raci'],
                             'risks': [], 'deliverable': blk['deliverable'], 'pv': blk['pv'], 'sessions': [s],
                             'agenda': [{'kind': 'session', 'code': s['code']}], 'prep': [],
                             **{k: v for k, v in info.items() if k != 'theme'}})
        continue
    aid = blk['sessions'][0]['atelier']
    info = pv.get(aid, {})
    ateliers.append({'id': aid, 'title': info.get('theme') or blk['header'], 'phase': blk['phase'],
                     'objectives': blk['objectives'], 'questionnaire': blk['questionnaire'], 'raci': blk['raci'],
                     'risks': blk['risks'], 'deliverable': blk['deliverable'], 'pv': blk['pv'],
                     'sessions': blk['sessions'], 'agenda': blk['agenda'], 'prep': prep.get(aid, []),
                     **{k: v for k, v in info.items() if k != 'theme'}})

ateliers.sort(key=lambda w: (w['id'][0] == 'C', int(w['id'][1:])))
OUT.write_text(json.dumps({'source': SRC.name, 'references': references, 'workshops': ateliers},
                          ensure_ascii=False, indent=2) + '\n')
print(f'{len(references)} références')
for w in ateliers:
    print(w['id'], w.get('date'), w['title'][:46], '|', w['phase'][:30], '|', len(w['sessions']), 'séq.',
          sum(len(s['steps']) for s in w['sessions']), 'étapes', sum(len(s['questions']) for s in w['sessions']), 'points',
          len(w['prep']), 'quest.')
