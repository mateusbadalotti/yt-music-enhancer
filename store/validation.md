# Validação da versão 1.0.0.

Data: 8 de outubro de 2026.

## Verificado.

- `npm run check`: passou.
- `npm test`: 34 testes passaram.
- ZIP validado com `unzip -t`, com 13 arquivos de produção e o manifest na raiz. Sem testes, materiais da loja ou arquivos temporários no pacote.
- Instalação do conteúdo extraído do ZIP em um perfil novo do Helium, baseado em Chromium. Extensão carregou sem erros próprios de JavaScript observados.
- Ícones PNG de 16, 32, 48 e 128 pixels. Imagem promocional de 440 × 280. Quatro capturas de tela de 1280 × 800, obtidas no site real sem conteúdo simulado.
- Engrenagem, abertura e fechamento pelo teclado, persistência das preferências e exportação/importação testadas no navegador.
- Filtros da home ocultos por padrão. Alternância visível/oculto, persistência após recarga e restauração via backup verificadas. A classe que oculta os filtros não é aplicada em Explorar. Sem o filtro, a primeira seção ocupa o espaço liberado.
- Busca real de Nora En Pure e carregamento de 30 sets. Capas visíveis e setas de navegação verificadas.
- Music from your artists iniciou com 30 músicas. Um teste real avançou até 90 IDs únicos, preservando os 30 itens iniciais. No pacote final, o carregamento automático de 30 para 60 também passou.
- Uma resposta HTTP 503 simulada na busca de músicas apresentou a opção de tentar novamente. A nova tentativa recuperou a lista com respostas reais do YouTube. Resultados repetidos, fim de resultados e preservação de dados após falha têm testes de unidade.
- Política de privacidade testada em inglês e português, com detecção de idioma, troca manual e largura móvel de 375 pixels. Não faz requisições externas ao abrir. Contato por e-mail e política do Google são links acionados pelo usuário.

## Antes do envio.

- Hospedar `privacy.html` em uma URL HTTPS pública. O arquivo local não substitui a URL exigida no painel.
- Fazer um último teste autenticado no Google Chrome. O Chrome não está instalado nesta máquina, e a validação desta preparação usou Helium sem login.
- Conferir playlists e capas, histórico, Surprise me e a reprodução no player com sua conta. Esses fluxos dependem de dados autenticados e não foram revalidados nesta preparação. O ajuste de tamanho do player já teve uma validação anterior em diferentes larguras, mas isso não substitui a reprodução autenticada final.
- Sets e músicas dependem dos resultados e limites do YouTube. O sucesso da consulta realizada não garante disponibilidade contínua ou 30 resultados para todos os artistas.

O pacote e os materiais estão preparados. Nenhum item foi enviado à loja e a política ainda não foi hospedada.
