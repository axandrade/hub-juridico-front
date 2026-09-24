import { Pipe, PipeTransform } from '@angular/core';

/**
 * Suporte mínimo de formatação (negrito, itálico, link, lista com marcador) — não é um parser
 * de markdown completo, cobre só o que a toolbar de `OperacaoComentariosComponent` produz.
 * Escapa o texto antes de aplicar as substituições; o `[innerHTML]` do Angular ainda passa
 * o resultado pelo sanitizador padrão por cima disso.
 */
@Pipe({ name: 'markdownLite' })
export class MarkdownLitePipe implements PipeTransform {
  transform(texto: string | null | undefined): string {
    return renderMarkdownLite(texto ?? '');
  }
}

export function renderMarkdownLite(texto: string): string {
  const escapado = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const blocos: string[] = [];
  let listaAberta = false;

  for (const linha of escapado.split('\n')) {
    const itemLista = /^\s*[-*]\s+(.+)/.exec(linha);
    if (itemLista) {
      if (!listaAberta) {
        blocos.push('<ul>');
        listaAberta = true;
      }
      blocos.push(`<li>${aplicarInline(itemLista[1])}</li>`);
      continue;
    }
    if (listaAberta) {
      blocos.push('</ul>');
      listaAberta = false;
    }
    blocos.push(aplicarInline(linha));
  }
  if (listaAberta) {
    blocos.push('</ul>');
  }
  return blocos.join('\n');
}

function aplicarInline(texto: string): string {
  return texto
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(\S(?:.*?\S)?)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
