'use client';

import { NativeSelect } from '@/components/ui/select';
import { folderDisplay } from '@/lib/notes/folders';

/** Lista de pastas com nomes amigáveis ("📥 Caixa de entrada") e a explicação da escolhida. */
export function FolderSelect({
  id,
  value,
  folders,
  onChange,
}: {
  id: string;
  value: string;
  folders: readonly string[];
  onChange: (folder: string) => void;
}) {
  const options = [...new Set(['', ...folders, value])]
    .filter((folder) => folder === '' || !folder.split('/').some((part) => part.startsWith('.')))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const hint = folderDisplay(value).hint;
  return (
    <div className="space-y-1">
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((folder) => {
          const display = folderDisplay(folder);
          const depth = folder ? folder.split('/').length - 1 : 0;
          return (
            <option key={folder} value={folder}>
              {`${'   '.repeat(depth)}${display.icon} ${display.label}`}
            </option>
          );
        })}
      </NativeSelect>
      <p className="text-muted-foreground text-xs">
        {hint ? `${hint}. ` : ''}
        {value ? (
          <span title="Nome real da pasta (o mesmo no Obsidian)">
            Pasta: <code>{value}</code>
          </span>
        ) : null}
      </p>
    </div>
  );
}
