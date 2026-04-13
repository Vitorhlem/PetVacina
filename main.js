const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true, // Esconde a barra superior estilo navegador
    icon: path.join(__dirname, 'frontend', 'assets', 'icon-512.png') // Se tiver um ícone
  });

  // Abre a sua tela de login inicial
  win.loadFile('frontend/login.html'); 
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});