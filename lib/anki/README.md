# Contrato de exportação APKG

O módulo `apkg.ts` é independente da UI e pode ser carregado dinamicamente num componente cliente Next:

```ts
const { buildMcqApkg, apkgBlob } = await import("@/lib/anki/apkg");
const result = await buildMcqApkg(payload);
const url = URL.createObjectURL(apkgBlob(result));
```

## Payload esperado

- `deckName`: nome do baralho Anki.
- `cards[]`: uma entrada por pergunta, com `id` estável, entre duas e quatro `options` (`html` + `isCorrect`), `explanationHtml`, `tags` e `sourceHtml` opcionais. A autoria editorial nova continua a exigir quatro opções.
- `image`, quando existe: `{ fileName, bytes, alt? }`. `bytes` é `Uint8Array` ou `ArrayBuffer`; nunca uma data URI.
- `generatedAt`, `deckId` e `modelId` são opcionais para builds determinísticos.

O resultado contém os bytes do `.apkg`, nome sugerido, IDs e contagens. O pacote usa `collection.anki2`, um único note type MCQ, uma nota/cartão por pergunta e media real através do mapa `media`. O módulo não usa filesystem, APIs de Node nem bindings nativos, pelo que deve ser invocado no browser para não acrescentar trabalho ao Worker Cloudflare.

## Integração com `/api/quizzes/export`

O adaptador aceita diretamente o JSON `{ deck, questions }` do endpoint. A integração exata na UI é:

```ts
const { buildQuizExportApkg, apkgBlob } = await import("@/lib/anki");
const payload = await response.json();
const result = await buildQuizExportApkg(payload);
const url = URL.createObjectURL(apkgBlob(result));
```

`buildQuizExportApkg()` ordena as opções pela posição, identifica a correta por `correctOptionId` e transforma `imageUrl` em bytes de media. Por omissão aceita uma data URI de imagem ou faz `fetch` de uma URL interna; `resolveImage` permite injetar outro mecanismo. A data URI nunca é escrita nos campos da nota.
