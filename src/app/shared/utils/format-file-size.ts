/**
 * Tamanho de arquivo legível (B / KB / MB), pt-BR-ish. `null` vira `'-'`.
 * Usado no explorador de arquivos e na tabela de visão geral de pastas.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) {
    return '-';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(kb < 10 ? 1 : 0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
