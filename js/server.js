// server.js
const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const app = express();

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(__dirname, 'config.json');
console.log('Sirviendo carpeta:', ROOT);

app.use(express.json({ limit: '256kb' }));

app.get('/api/config', async (_req, res) => {
  try {
    const text = await fs.readFile(CONFIG_PATH, 'utf8');
    res.type('json').send(text);
  } catch (err) {
    if (err && err.code === 'ENOENT') return res.json({});
    console.error('Error leyendo config.json:', err);
    res.status(500).json({ error: 'No se pudo leer config.json' });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const config = req.body && typeof req.body === 'object' ? req.body : {};
    await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    console.error('Error guardando config.json:', err);
    res.status(500).json({ error: 'No se pudo guardar config.json' });
  }
});

// Sirve estáticos (index.html, app.js, styles.css, items_capturados, etc.)
app.use(express.static(ROOT, { extensions: ['html'] }));

// Raíz
app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

// Fallback sin usar '*' (Express 5)
app.use((_req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Listo en http://localhost:${PORT}`));
