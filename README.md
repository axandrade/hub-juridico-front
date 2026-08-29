# Hub Jurídico — Frontend

Painel de gestão jurídica em **Angular 21** (standalone + signals + zoneless),
com sistema de design botânico (rouge / burgundy / creme) e componentes
altamente reutilizáveis.

![Protótipo](docs/hub-juridico%20prototipo%20tela1.jpeg)

---

## Stack

| Item | Versão | Observação |
|---|---|---|
| Angular | 21.x | standalone components, `signal`/`input()`/`output()`, zoneless change detection |
| PrimeNG | 21.x | tema via `@primeuix/themes` (preset `HubJuridicoPreset` derivado da paleta) |
| chart.js + ng2-charts | 4.x / 10.x | `provideCharts(withDefaultRegisterables())` |
| FontAwesome Free | 6.x | carregado por `angular.json > styles` (`fa-solid …`) |
| TypeScript | ~5.9 | `strict`, `strictTemplates` |
| Testes | Vitest | runner padrão do `@angular/build:unit-test` |

> **Nota de compatibilidade:** o briefing original pedia PrimeNG 17 / ng2-charts 4 /
> FontAwesome 4.7. Essas versões não são compatíveis com Angular 21, então foram
> elevadas para as linhas suportadas mantendo a mesma intenção de uso.

---

## Scripts

```bash
npm start        # ng serve  → http://localhost:4200
npm run build    # build de produção em dist/
npm test         # vitest (--no-watch para CI: ng test --no-watch)
```

---

## Autenticação

Integração real com o **hub-juridico-api** (JWT, `Authorization: Bearer`).

### Configuração

`src/environments/environment.ts` — só valores públicos, sem segredo:

| Ambiente | `apiBaseUrl` |
|---|---|
| dev (`environment.ts`) | `http://localhost:8000/api/v1` |
| prod (`environment.prod.ts`, via `fileReplacements`) | `/api/v1` (mesmo domínio, atrás de proxy HTTPS) |

### Fluxo

1. **Login** por **CPF + senha** (`POST /auth/login/` com `{ cpf, senha }`) — o campo tem
   máscara `000.000.000-00` (`CpfMaskDirective`) e validação de dígitos verificadores
   (`core/auth/cpf.ts`, porta do validador do back-end); o front envia só os dígitos.
   Em seguida guarda o par de tokens e carrega o perfil (`GET /auth/me/`).
2. **`provideAppInitializer`** roda `AuthService.bootstrap()` no start: se há refresh token
   persistido, faz um *silent refresh* e reidrata a sessão — o F5 mantém o usuário logado.
3. **`authInterceptor`** anexa o `Bearer` e, ao receber `401`, renova o token uma única vez
   (`AuthService.refresh` é *single-flight*) e repete a requisição. Refresh falhou →
   `clearSession()` + redirect para `/login`.
4. **`must_change_password`** → `authGuard` manda para `/trocar-senha` e bloqueia o resto do
   app; ao concluir, a sessão é encerrada e o usuário reautentica.
5. **Logout** (`POST /auth/logout/`) revoga o refresh token no servidor (blacklist) antes de
   limpar o estado local.

### Estratégia de armazenamento de token

| Token | Onde | Porquê |
|---|---|---|
| **access** (enviado em toda request) | só em memória (`TokenStore`) | nunca toca `storage` → reduz exposição a XSS |
| **refresh** | `localStorage` (ou `sessionStorage` se "Lembrar-me" off) | sessão sobrevive ao reload |

**Produção — endurecer:** mover o refresh token para um cookie `httpOnly; Secure;
SameSite=Strict` (exige auth por cookie + endpoint de refresh via cookie no back-end),
servir tudo sob **HTTPS** e publicar uma **CSP** restritiva. Como a API usa apenas o header
`Authorization`, **CSRF não se aplica** ao modelo atual.

### Rodando back-end + front-end

```bash
# terminal 1 — API (precisa de MongoDB no ar)
cd ../../backend/python/hub-juridico-api
.venv\Scripts\python manage.py runserver        # :8000

# terminal 2 — front
npm start                                        # :4200
```

---

## Arquitetura de pastas

```
src/
├── styles/                     # Sistema de design SCSS (partials via @use)
│   ├── _variables.scss         # Paleta + tipografia + espaçamento + sombras
│   ├── _mixins.scss            # flex helpers, card-surface, hover-pale, breakpoints
│   ├── _typography.scss
│   └── _global.scss            # reset + utilitários + CSS custom properties (:root)
├── styles.scss                 # entrypoint global
│
└── app/
    ├── core/                   # Singletons, sem UI. Importado uma única vez.
    │   ├── auth/
    │   │   ├── auth.models.ts         # tipos + extractApiErrorMessage (envelope da API)
    │   │   ├── cpf.ts                 # onlyDigits / maskCpf / isValidCpf / cpfValidator
    │   │   ├── password-policy.ts     # validadores espelhando o back-end
    │   │   ├── token-store.ts         # access em memória, refresh em storage
    │   │   └── auth.interceptor.ts    # Bearer + silent refresh em 401
    │   ├── constants/
    │   │   ├── color-palette.ts       # COLOR_PALETTE / COLOR_SEMANTIC / CHART_COLOR_SEQUENCE
    │   │   ├── app-constants.ts       # APP_INFO, SIDEBAR_NAV, ROUTES, DATE_FORMAT, CURRENCY
    │   │   └── primeng-preset.ts      # preset PrimeNG derivado da paleta
    │   ├── guards/auth.guard.ts       # authGuard / publicOnlyGuard / passwordChangeGuard
    │   ├── models/                    # ITask, ICommitment, IProcess (+ enums e labels)
    │   ├── data/mock-data.ts          # dados estáticos de demonstração
    │   └── services/
    │       ├── auth.service.ts        # login / bootstrap / refresh / logout / changePassword
    │       ├── data.service.ts        # getTasks/getCommitments/getProcesses → Observable
    │       └── theme.service.ts       # getColors / getChartColors / getChartConfig
    │
    ├── shared/                  # Componentes/pipes/diretivas apresentacionais e genéricos
    │   ├── components/
    │   │   ├── button/          # <app-button>  variant primary|secondary|tertiary
    │   │   ├── badge/           # <app-badge>   tone primary|success|warning|danger|neutral
    │   │   ├── card/            # <app-card>    cabeçalho ":: título … Editar → x"
    │   │   ├── table/           # <app-data-table> genérica (columns + data + format)
    │   │   └── chart/           # <app-bar-chart> / <app-pie-chart> (paleta automática)
    │   ├── directives/
    │   │   ├── highlight.directive.ts          # [appHighlight] hover botânico
    │   │   └── cpf-mask.directive.ts           # [appCpfMask] máscara 000.000.000-00
    │   ├── pipes/               # | dateFormat   | currencyFormat  (pt-BR / BRL)
    │   └── index.ts             # barrel
    │
    ├── layout/                  # Casca da aplicação
    │   ├── layout.component.*   # sidebar + header + <router-outlet> + footer
    │   └── components/
    │       ├── sidebar/         # burgundy, navegação do protótipo, colapsável
    │       ├── header/          # rouge claro, ações rápidas, contexto/usuário
    │       └── footer/
    │
    └── features/
        └── dashboard/           # Feature "Resumo geral" (lazy: loadChildren)
            ├── dashboard.routes.ts        # DASHBOARD_ROUTES + provider DashboardService
            ├── services/dashboard.service.ts   # orquestra DataService → DashboardViewModel
            └── components/
                ├── dashboard-container/   # SMART: injeta serviço, distribui view models
                ├── tasks-widget/          # DUMB: [labels] [series]
                ├── commitments-widget/    # DUMB: [labels] [series]
                └── processes-widget/      # DUMB: [slices] [activeCount]
```

### Fluxo de dados (smart / dumb)

```
DataService ──(mock + delay)──► DashboardService.loadDashboard(): Observable<DashboardViewModel>
                                        │
                          DashboardComponent (smart)  ── async pipe ──► template
                                        │  @Input()
                 ┌──────────────────────┼───────────────────────┐
          tasks-widget           commitments-widget        processes-widget   (dumb)
          app-bar-chart            app-bar-chart              app-pie-chart
```

---

## Paleta de cores (mood botânico)

| Token | HEX | Uso |
|---|---|---|
| `$burgundy-deep` | `#2B0F12` | Contornos, títulos, sidebar |
| `$rouge-dark` | `#8D2A3A` | Botões primários, hover, ênfase |
| `$rouge-light` | `#C85C5C` | Cards, headers, elementos interativos |
| `$pink-pale` | `#E8B4B8` | Backgrounds suaves, separadores, hover leve |
| `$cream-warm` | `#F4F1DE` | Fundo principal |

A paleta existe em **três formas sincronizadas**:

1. **SCSS** — `src/styles/_variables.scss` (`$color-primary`, `$shadow-md`, …)
2. **TypeScript** — `core/constants/color-palette.ts` (`COLOR_PALETTE`, `COLOR_SEMANTIC`)
3. **CSS custom properties** — `:root { --color-primary; … }` em `_global.scss`
   (permite tema dinâmico e leitura via `ThemeService.getCssVariable()`)

Componentes SCSS acessam os tokens com `@use 'variables' as *;`
(o caminho `src/styles` está em `angular.json > stylePreprocessorOptions.includePaths`).

---

## API dos componentes genéricos

### `<app-button>`
| Input | Tipo | Default |
|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'tertiary'` | `'primary'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `icon` | `string` (classe FontAwesome) | `''` |
| `label` | `string` | `''` |
| `disabled` | `boolean` | `false` |
| `block` | `boolean` | `false` |

Output: `clicked: EventEmitter<MouseEvent>`

### `<app-card>`
| Input | Tipo | Default |
|---|---|---|
| `title` | `string` | `''` |
| `icon` | `string` | `''` |
| `backgroundColor` | `string` | `'var(--color-surface)'` |
| `borderColor` | `string` | `'var(--color-pink-pale)'` |
| `showEdit` / `showClose` / `loading` | `boolean` | `true` / `true` / `false` |

Outputs: `edit`, `navigate`, `close`.
Slots: `[card-actions]`, conteúdo padrão, `[card-footer]`.

### `<app-data-table>`
| Input | Tipo |
|---|---|
| `columns` | `TableColumn<T>[]` (`key`, `header`, `align?`, `width?`, `format?`, `formatter?`) |
| `data` | `T[]` |
| `loading` / `emptyMessage` / `trackKey` | `boolean` / `string` / `keyof T \| null` |

Output: `rowClick: EventEmitter<T>`. `format`: `'text' \| 'date' \| 'currency' \| 'badge'`.

### `<app-bar-chart>` / `<app-pie-chart>`
- `bar-chart`: `[labels]: string[]`, `[series]: BarChartSeries[]`
- `pie-chart`: `[slices]: PieChartSlice[]`, `[doughnut]: boolean`

As cores das séries vêm de `ThemeService.getChartColors()` (sequência botânica)
quando não são informadas explicitamente.

---

## Boas práticas aplicadas

- Standalone components + `ChangeDetectionStrategy.OnPush` + zoneless
- `signal`, `computed`, `input()`, `input.required()`, `output()`
- Smart/Dumb: `DashboardComponent` orquestra, widgets só recebem `@Input`
- Lazy loading por rota (`loadChildren` / `loadComponent`) + `withComponentInputBinding()`
- Serviços singleton `providedIn: 'root'`; `DashboardService` com escopo de rota
- Interfaces tipadas, sem `any`; `strictTemplates`
- `async` pipe no template do smart component
- SCSS com `@use`/`@forward` (sem `@import` legado) e tokens centralizados
- CSS custom properties para tema dinâmico
- Locale `pt-BR` + `BRL` registrados globalmente

---

## Documentação de apoio

`docs/` contém o protótipo da tela, a paleta de referência e o briefing original.
