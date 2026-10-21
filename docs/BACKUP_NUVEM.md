# Backup no Google Drive

O app continua hospedado no GitHub Pages. O navegador usa a API do Drive e o login Google diretamente, sem backend do projeto e sem Client Secret no código.

## Como usar

Treinador → Seus dados → Backup no Google Drive:

1. Preparar login Google carrega o SDK; Conectar abre a autorização da conta.
2. Enviar backup agora guarda um ZIP completo, incluindo progresso, ajustes, cartas reconhecidas, IndexedDB e arquivos do cache do app.
3. Em outro aparelho, abra o mesmo app e conecte à mesma conta Google. Atualize a lista, escolha Restaurar e confira a confirmação antes de substituir o estado local.
4. Cada envio cria uma cópia independente por data. A lista mostra até 20 cópias recentes, sem apagar as anteriores. A nuvem usa espaço da conta Google. Não há sincronização automática ou fusão de saves.

A restauração usa a mesma validação e recuperação de falhas do backup local. Falhas persistentes de armazenamento podem impedir também a recuperação; mantenha uma cópia ZIP baixada. Um backup não é um mecanismo contra trapaça nem prova autenticidade: seus hashes detectam corrupção dos arquivos cobertos pelo manifesto.

## Habilitar no projeto (pelo navegador)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie/selecione um projeto e habilite **Google Drive API**.
2. Configure o consentimento no Google Auth Platform, com os dados reais do app e os links de privacidade exigidos pelo Google. Adicione somente o escopo `https://www.googleapis.com/auth/drive.appdata`. Enquanto estiver em testes, cadastre as contas de teste autorizadas. Para liberar ao público, conclua as exigências de publicação do Google.
3. Crie um Client ID OAuth do tipo **Aplicativo da Web**. Em origens JavaScript autorizadas coloque `https://eddiericobom.github.io` (sem `/pokemon-tcg-ar/`). O fluxo usa popup, sem redirecionamento de backend. Em desenvolvimento, autorize a origem local exata usada para o teste.
4. No GitHub: repositório → Settings → Secrets and variables → Actions → **Variables** → New repository variable. Nome: `GOOGLE_DRIVE_CLIENT_ID`. Valor: o Client ID terminado em `.apps.googleusercontent.com`.
5. Rode o workflow **Deploy no GitHub Pages** depois que a implementação estiver na main. O build lê essa variável como `VITE_GOOGLE_CLIENT_ID`. Sem ela, a interface informa que a nuvem não está habilitada e mantém o backup local disponível.

O Client ID é público. **Não crie nem publique Client Secret, credencial de conta de serviço ou token de acesso no repositório.** Não é necessário instalar ferramentas no PC.

## Privacidade e limites

- A permissão `drive.appdata` dá acesso apenas à pasta de dados criada por este aplicativo. Ela fica oculta no Drive normal; não permite ler os demais documentos do usuário.
- O conteúdo completo do backup é enviado ao Google somente após o jogador pedir. O app não adiciona criptografia própria ao ZIP.
- Tokens ficam apenas em memória e não entram no backup, localStorage ou Service Worker. Desconectar revoga a autorização; sair da tela descarta o token local e cancela as solicitações em andamento.
- Autorização expirada exige nova conexão por gesto do usuário. A rede/Google pode falhar ou recusar o envio por falta de espaço.
- Upload usa o protocolo resumable do Drive em uma transferência. Não retoma automaticamente após recarregar a página. Envio interrompido não remove backups antigos.
- Limite de 512 MB por arquivo, igual ao limite de importação local; coleções grandes exigem memória para compactar. Não foi medido desempenho em celular real.
- Integração externa só pode ser validada integralmente depois de configurar um Client ID real, a origem de produção e uma conta autorizada. Testes com respostas simuladas não comprovam funcionamento do OAuth nem CORS em produção.

Referências: [modelo de token Google](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [pasta appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata), [uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
