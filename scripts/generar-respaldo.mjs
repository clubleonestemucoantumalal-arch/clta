#!/usr/bin/env node
/* Copia data/agenda-distrito.json y data/noticias.json dentro de assets/js/respaldo-datos.js,
   para que el sitio muestre agenda y noticias también al abrir index.html con doble clic
   (el navegador no deja leer los .json en ese modo). Uso: npm run respaldo */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = async (r) => JSON.parse(await readFile(resolve(RAIZ, r), 'utf8'));

const agenda = await leer('data/agenda-distrito.json');
const noticias = await leer('data/noticias.json');
const propias = await leer('data/noticias-propias.json');
const js = '/* Generado por scripts/generar-respaldo.mjs. Solo se usa si no se pueden leer los .json (doble clic). */\n'
  + 'window.RESPALDO_AGENDA = ' + JSON.stringify(agenda) + ';\n'
  + 'window.RESPALDO_NOTICIAS = ' + JSON.stringify(noticias) + ';\n'
  + 'window.RESPALDO_NOTICIAS_PROPIAS = ' + JSON.stringify(propias) + ';\n';
await writeFile(resolve(RAIZ, 'assets/js/respaldo-datos.js'), js, 'utf8');
console.log('Respaldo de agenda y noticias actualizado.');
