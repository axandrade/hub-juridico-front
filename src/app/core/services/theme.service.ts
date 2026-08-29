import { Injectable } from '@angular/core';
import { ChartOptions, ChartType } from 'chart.js';

import {
  CHART_COLOR_SEQUENCE,
  COLOR_PALETTE,
  COLOR_SEMANTIC,
} from '../constants/color-palette';

/**
 * Ponto central de acesso ao tema botânico: expõe a paleta para código
 * TypeScript e produz configurações de gráfico já alinhadas às cores.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  getColors(): typeof COLOR_PALETTE {
    return COLOR_PALETTE;
  }

  getSemanticColors(): typeof COLOR_SEMANTIC {
    return COLOR_SEMANTIC;
  }

  /** Sequência de cores para séries de dados. */
  getChartColors(count: number): string[] {
    return Array.from(
      { length: count },
      (_, i) => CHART_COLOR_SEQUENCE[i % CHART_COLOR_SEQUENCE.length],
    );
  }

  /** Lê uma CSS custom property em runtime (tema dinâmico). */
  getCssVariable(name: string): string {
    if (typeof document === 'undefined') {
      return '';
    }
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Opções base compartilhadas por todos os gráficos. */
  getChartConfig(type: ChartType): ChartOptions {
    const grid = COLOR_SEMANTIC.BORDER;
    const text = COLOR_SEMANTIC.TEXT_SECONDARY;

    const base: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: type === 'pie' || type === 'doughnut',
          position: 'right',
          labels: { color: text, font: { size: 12 }, boxWidth: 14 },
        },
        tooltip: {
          backgroundColor: COLOR_PALETTE.BURGUNDY_DEEP,
          titleColor: COLOR_PALETTE.CREAM_WARM,
          bodyColor: COLOR_PALETTE.CREAM_WARM,
          padding: 10,
          cornerRadius: 8,
        },
      },
    };

    if (type === 'bar' || type === 'line') {
      base.scales = {
        x: {
          grid: { color: 'transparent' },
          ticks: { color: text, font: { size: 11 } },
          border: { color: grid },
        },
        y: {
          grid: { color: grid },
          ticks: { color: text, font: { size: 11 }, precision: 0 },
          border: { color: grid },
          beginAtZero: true,
        },
      };
    }

    return base;
  }
}
