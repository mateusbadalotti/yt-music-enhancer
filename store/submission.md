# Publicação na Chrome Web Store.

## Arquivos.

- `../dist/enhance-for-youtube-music-1.0.0.zip`: pacote para upload. O manifest fica na raiz, com apenas os arquivos utilizados pela extensão.
- `privacy.html`: política bilíngue, independente de outros arquivos. Hospede em uma URL HTTPS pública e informe essa URL no campo de privacidade da loja.
- `../icons/icon-128.png`: ícone de 128 × 128.
- `promo-440x280.png`: imagem promocional obrigatória.
- `screenshots/`: capturas de 1280 × 800 da interface real.
- `listing-en.md` e `listing-pt-BR.md`: textos para copiar nos respectivos idiomas.
- `icon.svg` e `promo.svg`: fontes editáveis das artes.

## Campos do painel.

Nome: Enhance for Youtube Music™.

Idioma principal: inglês. Adicione a descrição localizada em português do Brasil.

Contato de suporte: mateus.badalotti@gmail.com.

Categoria sugerida: escolha a categoria disponível que melhor corresponda a personalização de interface ou entretenimento.

URL da política: informe a URL pública onde você hospedar `privacy.html`. Não use caminho local ou link que exija login.

## Single purpose description.

Customize the YouTube Music interface and home experience with user-controlled sections, artist and listening-history shelves, and a centered player layout.

## Storage permission justification.

Stores the user's selected artists, home section order and visibility, and player layout preference in chrome.storage.local. Uses chrome.storage.session to cache public YouTube set results and coordinate request timing. Supports user-initiated export and import of preferences. The extension does not sync this storage to a developer server.

## Host permission justification.

Access to https://www.youtube.com/* is required for the service worker to request public search results for artists and extract long-form sets displayed in the extension's home shelves. These requests omit account cookies. No scripts are injected into www.youtube.com. Content scripts run only on https://music.youtube.com/* to add the settings button, customize the home and player layout, and request Music content using the user's existing session.

## Remote code.

No. All executable JavaScript and CSS are included in the extension package. YouTube responses are processed as data; scripts from those responses are not executed. Artwork is loaded as images from YouTube and Google image services.

## Declarações de dados.

Não declare que a extensão não trata dados. Ela acessa dados localmente e faz requisições aos serviços do Google. Revise a redação dos campos exibidos pelo painel antes de confirmar.

| Categoria | Tratamento existente. |
| --- | --- |
| Authentication information. | Cookie de sessão lido na página para assinar requisições ao próprio YouTube Music. Não é salvo pela extensão nem enviado ao desenvolvedor. |
| Web history. | Histórico de reprodução do YouTube Music para reproduções longas e recomendações. Não acessa o histórico geral do navegador. |
| User activity. | Buscas de artistas, escolhas de seções e preferências usadas pelos recursos visíveis. Sem analytics. |
| Website content. | Playlists, títulos, capas, metadados e conteúdo do YouTube Music e resultados públicos do YouTube. |
| Personally identifiable information. | Respostas do Music podem incluir nomes de exibição da conta e dos donos de playlists. Se houver contato voluntário por e-mail, o suporte recebe o endereço e o conteúdo enviado. |

Não há recurso de coleta de dados financeiros, saúde, localização precisa ou mensagens pessoais. As requisições diretas ao Google expõem informações normais de conexão, como IP. O suporte por e-mail é separado da extensão.

As certificações de não vender dados, não usá-los fora da finalidade declarada e não usá-los para crédito ou empréstimos correspondem ao comportamento atual. A política inclui a declaração de Uso Limitado.

## Reviewer test instructions.

1. Install the extension and open or reload https://music.youtube.com/ in a desktop browser.
2. Click the gear next to the profile area. There is no extension toolbar popup.
3. Toggle a home section and move it with the arrow controls. Reload the page and verify the saved settings.
4. Sign in with your own YouTube Music account to test library and listening-history features. The extension has no separate account or paid unlock. No developer credentials are required or provided.
5. Search for an artist in settings and add the result. Enable Sets from your artists and New from your artists. Close settings and select the artist in the sets shelf. Results depend on YouTube availability. The set limit is up to 30, not a guaranteed count. A temporary YouTube search block is shown with a retry message.
6. Enable Artists you have listened to on an account with listening history. Surprise me refreshes the displayed recommendations without starting playback.
7. In the expanded desktop player, toggle Hide player side panel. The artwork or video should retain its size and become centered.
8. At the bottom of settings, export preferences, change a setting, and import the saved JSON file. Verify that the previous preferences return.
9. Test keyboard navigation, carousel arrows, a narrow viewport, and English or Portuguese browser languages. Reload the Music tab after changing the extension language or switching YouTube accounts.
10. Enable Music from your artists with at least one artist added. The shelf starts with up to 30 shuffled songs. Use the carousel arrows or horizontal scrolling to approach the end; another batch loads automatically. Previously loaded cards remain in place without repeated video IDs. Load more also works as a manual control. Loading stops when YouTube has no more matching results; a retry control is shown if a request fails.
11. In settings, Home > Hide home filters is enabled by default. Disable it to restore the mood and activity chips, such as Podcasts and Romance. Verify persistence after reloading and after exporting/importing preferences. This setting applies only to the home page.

## Envio.

1. Hospede `privacy.html` e verifique que a URL funciona sem login.
2. Faça a validação autenticada final descrita em `validation.md`.
3. Abra https://chrome.google.com/webstore/devconsole e crie um novo item.
4. Envie apenas o ZIP de `dist`, não a pasta do projeto inteira.
5. Preencha os textos, imagens, privacidade, justificativas e instruções acima.
6. Escolha a distribuição e envie para revisão. A revisão pode pedir ajustes; preparar os arquivos não garante aprovação.

## Referências oficiais.

- Publicação: https://developer.chrome.com/docs/webstore/publish.
- Imagens: https://developer.chrome.com/docs/webstore/images.
- Declarações de privacidade: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy.
- Tratamento de dados: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq.
