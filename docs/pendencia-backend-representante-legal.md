# Pendência backend — representante legal pessoa jurídica

**Contexto:** no cadastro de cliente PJ, o representante legal pode ser pessoa
**física ou jurídica**. O frontend já trata as duas naturezas (toggle no dialog
`ClientRepresentativeDialogComponent`), mas o contrato atual de
`com.hubjuridico.dominio.RepresentanteLegal` só tem `nome` + `cpf`.

## O que o frontend já envia (POST/PUT `/api/v1/pessoas`)

No array `representantes`, cada item passou a incluir 3 campos novos:

| campo (JSON)   | tipo               | quando preenchido        |
|----------------|--------------------|--------------------------|
| `tipo`         | `"FISICA"` \| `"JURIDICA"` | sempre            |
| `cnpj`         | string (só dígitos) \| null | só quando `tipo = JURIDICA` |
| `razao_social` | string \| null     | só quando `tipo = JURIDICA` |

Compat provisória enquanto o backend não muda: quando `tipo = JURIDICA`, o
frontend também manda `nome` = razão social e `cpf` = `""` (string vazia), para
não quebrar a validação atual. **Assim que o backend aceitar os campos novos,
essa gambiarra pode sair** (ver `representanteToApi` em `client-mapper.ts`).

## O que falta no backend

1. `RepresentanteLegal`: adicionar discriminador de natureza (`tipo`) e os campos
   `cnpj` / `razaoSocial` (análogo a `PessoaFisica` / `PessoaJuridica`).
2. Validação condicional: `nome`/`cpf` obrigatórios só quando `tipo = FISICA`;
   `razaoSocial`/`cnpj` obrigatórios só quando `tipo = JURIDICA`. Hoje o `cpf`
   é validado por módulo-11 sempre — precisa passar a valer só para física, e
   `cnpj` ganhar a validação equivalente.
3. Response (`RepresentanteRespApi`): devolver `tipo`, `cnpj` e `razao_social`.
   Enquanto não devolver, um representante PJ salvo volta como
   `tipo: "FISICA"` com a razão social em `nome` (o mapper de entrada trata o
   fallback, mas é recuperação parcial).

## Frontend — arquivos envolvidos

- `core/models/pessoa.model.ts` — `IRepresentanteLegal` (+ `tipo`, `razaoSocial`, `cnpj`)
- `features/clients/forms/client-form.factory.ts` — `RepresentanteGroup`, `setTipoRepresentante`
- `features/clients/models/client-form.model.ts` — `REPRESENTANTE_FISICA_FIELDS` / `REPRESENTANTE_JURIDICA_FIELDS`
- `features/clients/services/client-api.model.ts` — `RepresentanteApi` (campos opcionais)
- `features/clients/services/client-mapper.ts` — `representanteToApi` / `representanteFromApi`
- `features/clients/components/client-representative-dialog/` — dialog de edição
- `features/clients/components/client-representatives/` — lista enxuta
