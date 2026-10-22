import page from '../pages/Page.module.css';
import { downloadCsv, type Column } from '../model/exporters';

export type { Column };

/**
 * Exporte en CSV ce que l'écran affiche : les lignes passées sont celles déjà filtrées, triées et
 * recherchées. Avec un filtre actif, le libellé donne le nombre de lignes et le fichier est marqué « filtre ».
 */
export function ExportButton<T>({
  name,
  rows,
  columns,
  filtered = false,
  noun = 'lignes',
  label = 'Exporter',
}: {
  /** Nom du fichier, sans date ni extension (« risques »). */
  name: string;
  rows: T[];
  columns: Column<T>[];
  /** Un filtre ou une recherche réduit-il la liste ? */
  filtered?: boolean;
  /** Ce que l'on compte, au pluriel (« risques »). */
  noun?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={page.ghost}
      disabled={!rows.length}
      title={
        filtered
          ? `Exporter en CSV les ${rows.length} ${noun} affichés, selon les filtres en cours`
          : `Exporter en CSV les ${rows.length} ${noun} de l’écran`
      }
      onClick={() => downloadCsv(filtered ? `${name}-filtre` : name, columns, rows)}
    >
      ⤓ {filtered ? `${label} ces ${rows.length} ${noun}` : label} (CSV)
    </button>
  );
}
