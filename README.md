# Ateliê de crochê

App pra controlar os pedidos de crochê: fila com prioridade, horas (com cronômetro), compras, estoque de cores, receitas e preço sugerido.

Roda no GitHub Pages, guarda os dados no Firebase (Firestore) e mantém uma cópia no aparelho, então funciona sem internet e sincroniza quando a conexão volta. Dá pra instalar no celular pelo menu do navegador ("Adicionar à tela inicial").

## Ligar o Firebase (uma vez só)

1. Entra em https://console.firebase.google.com e cria um projeto (pode desligar o Google Analytics).
2. **Firestore Database** > Criar banco de dados > modo de produção > região `southamerica-east1 (São Paulo)`.
3. Ainda no Firestore, aba **Regras**: apaga o que tiver, cola o conteúdo de `firestore.rules` e clica em Publicar.
4. **Authentication** > Começar > **Google** > Ativar > Salvar.
5. **Authentication** > Configurações > **Domínios autorizados** > Adicionar domínio: `inaciow.github.io`.
6. Engrenagem > Configurações do projeto > Seus apps > ícone **</>** (Web). Registra o app (não precisa de Hosting) e copia os valores do `firebaseConfig` pra dentro de `cfg.js`.

O `firebaseConfig` não é segredo: quem protege os dados são as regras do passo 3, que deixam cada conta ler e escrever só os próprios dados.

## Ligar o GitHub Pages

Settings > Pages > Source: **Deploy from a branch** > Branch: `main` / `(root)` > Save. O app fica em https://inaciow.github.io/atelie/

## App Android (pasta `android/`)

O APK é uma casca nativa em volta do site: ele abre https://inaciow.github.io/atelie/ numa WebView, então push na `main` continua atualizando o app sem APK novo. O lado nativo (`MainActivity.kt`) cuida do que a WebView não faz sozinha:

- **login nativo do Google** (Credential Manager): o Google devolve um ID token e o site entra no Firebase com `signInWithCredential`, na mesma conta (mesmo uid) do login pelo navegador;
- **backup e planilha** vão pra pasta Downloads;
- **tela acesa** no timer e na receita, **timer na notificação**, contando mesmo com o app fechado, e **botões de volume** passando os passos da receita;
- barras do sistema e ícone (adaptativo e monocromático) certos.

O site fala com o app pelo objeto `AtelieAndroid` (mensagens JSON: `entrar`, `sair`, `salvar`, `tela`, `timer`) e recebe respostas em `window.atelieDoAndroid`. No navegador esse objeto não existe e nada muda.

**Como o APK é feito:** o workflow `.github/workflows/apk.yml` compila quando muda algo em `android/`, e também pode ser rodado na mão (Actions > APK Android > Run workflow). Na `main`, com os segredos abaixo, ele publica o `atelie.apk` assinado numa Release nova. Sem os segredos, gera só um APK de teste nos artefatos.

**Configurar uma vez:**

1. GitHub > Settings > Secrets and variables > Actions > New repository secret:
   - `APK_KEYSTORE`: a chave de assinatura (arquivo `.p12` em base64);
   - `APK_SENHA`: a senha da chave.

   Guarda uma cópia da chave e da senha fora do GitHub. Sem elas não dá pra atualizar o app instalado: teria que desinstalar e instalar de novo (os dados ficam no Firebase, só o que estiver esperando internet no aparelho se perde).
2. Firebase > Configurações do projeto > Seus apps > Adicionar app > **Android**:
   - nome do pacote `io.github.inaciow.atelie`;
   - **SHA-1** da chave (`keytool -list -v -keystore atelie.p12`).

   Sem isso o login nativo do Google falha. Não precisa baixar o `google-services.json`.
3. Actions > APK Android > Run workflow (na `main`). O APK sai em Releases.

No celular, o Obtainium pode acompanhar as Releases do repositório e atualizar sozinho.

## Receita passo a passo

Na aba Receitas, cada receita pode ter o texto inteiro (colado ou importado de `.md`, `.txt` ou `.pdf`; do PDF vem só o texto, pelo pdf.js). O `passosReceita()` em `app.js` transforma o texto em passos:

- rodadas: `R5:`, `Rodada 5`, `Carreira 3`, `C3`, `Volta 2`, `Row 4`, `5ª carreira`; intervalos (`R7-R10`, `Carreira 2 a 4`) viram um passo por rodada;
- partes: títulos com `#` (ou, sem nenhum `#`, linhas curtas terminadas em `:`);
- o resto vira anotação, no lugar onde aparece; o total no fim, tipo `(18)`, vira "18 pontos";
- sem rodadas reconhecidas, cada linha vira um passo.

"Seguir" abre a receita um passo por vez. O progresso fica no pedido (`passo`), então cada peça lembra onde parou. Dá pra passar cada rodada por partes (separadas por vírgula, bom pra tapestry), e cores do Estoque que aparecem no texto ganham uma bolinha com a cor. No app Android, os botões de volume passam os passos; no computador, espaço e setas.

## Preço sugerido

`sugerePreco()` em `app.js`: trabalho (horas × valor da hora) + criação (porcentagem no trabalho por tipo custom) + material (compras da peça ou média das peças da mesma receita) + miudezas + custos indiretos + urgência (se o prazo for curto) + embalagem, e por cima a taxa de pagamento. As horas estimadas são corrigidas pelo que as peças prontas levaram de verdade (mediana de pelo menos 3), menos quando a receita já tem peças prontas, porque aí a estimativa já vem da média real. O preço de família dá desconto só no trabalho. Tudo se ajusta na Config.

## Atualizações

Push na `main` publica no GitHub Pages em 1 ou 2 minutos. Como o `V` do `sw.js` muda a cada versão, o service worker novo assume e a página recarrega sozinha quando o app volta pra frente (sem formulário aberto). O app Android pega a versão nova do mesmo jeito, sem APK novo. APK novo só quando muda algo em `android/`.

## Trazer os dados do app antigo

No app antigo do Claude: Config > Baixar backup (.json). No app novo: Config > Importar backup.

## Onde ficam os dados

Tudo fica em `users/<seu uid>/` no Firestore:

| Caminho | O que é |
| --- | --- |
| `pedidos/<id>` | nome, cliente, contato, tipo, status, prazo, horasEst, preco (0 = brinde), sinal, pago, ordem, pedidoEm, entregueEm, receitaId, passo (em que passo da receita a peça está), contador e contaPasso (contador do Timer e de quanto em quanto ele conta), lixo |
| `horas/<id>` | pedidoId, data, horas, inicio, fim, lixo |
| `compras/<id>` | item, tipo, cor, qtd, precoUn, pedidoId (vazio = estoque), onde, comprado, compradoEm, lixo |
| `estoque/<id>` | cor, situacao, ordem, hex (cor de verdade, ex. `#c0392b`), lixo |
| `receitas/<id>` | personagem, fonte, autor, altura, arquivo, tipoPadrao, horasPadrao, precoPadrao, acompanhaId (receita feita junto, ex. o chapéu), texto (a receita em Markdown ou texto), passo (progresso quando segue sem peça), lixo |
| `meta/config` | valorHora, precoNovelo, miudezas, descontoFamilia, metaNatal, indiretos, embalagem, extraSimples, extraMedio, extraComplexo, taxaPag, urgencia, urgDias, corrigeHoras |
| `meta/timer` | pedidoId, inicio (timer rodando; cada pausa vira uma sessão em `horas`) |

## Regras pra mexer no app sem estragar os dados

- O app lê tudo pelo `NORM` em `app.js`: campo que falta ganha um valor padrão, campo que o código não conhece é ignorado. Campo novo entra sempre com padrão lá.
- Gravação só manda os campos que mudaram (`updateDoc`), então campo de função removida continua guardado.
- Nunca renomear campo direto: cria o novo e lê com fallback pro antigo.
- Excluir é `lixo: true`. Apagar de verdade só pela Lixeira.
- Antes de mudança grande: Config > Baixar backup.
- Depois de mudar arquivos, troca o `V` em `sw.js` (ex.: `atelie-2`) pro celular pegar a versão nova.
