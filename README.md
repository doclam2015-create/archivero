# Archivero

Gestor de archivos, lector y editor de PDF, escáner, navegador y reproductor para iPhone, iPad y Mac. Gratis, sin publicidad y sin conexión: tus archivos no salen del dispositivo.

**Abrir en iPhone/iPad:** https://doclam2015-create.github.io/archivero/ → Safari → Compartir → «Agregar a inicio».

## Funciones
- **Archivos:** carpetas, cuadrícula/lista, ordenar, búsqueda global (nombre, etiquetas, notas), filtros, favoritos, recientes, etiquetas y colores, papelera, mover/copiar/duplicar/renombrar, arrastrar y soltar, selección múltiple, ZIP, enlaces guardados, barra lateral compacta y personalizable, centro de control.
- **PDF:** lector (miniaturas, búsqueda, índice, zoom, modo noche, voz alta), anotar, firmar, rellenar formularios, corrector blanco + texto (editar), **censura segura**, organizar/unir/dividir, reducir, **contraseña** (poner y quitar), convertir **a Word, Excel, PowerPoint, imagen y texto**.
- **Escáner** con corrección de perspectiva, filtros y OCR.
- **Multimedia:** visores de imagen, video y audio; reproductor en segundo plano; editor de audio (recortar, cortar, eliminar silencios, normalizar, metadatos MP3); convertir y comprimir audio y video; extraer audio de video; **eliminar objetos** de fotos; convertir imágenes (HEIC→JPG).
- **Navegador:** motores de búsqueda (Google, Bing, DuckDuckGo, Yahoo, Ecosia, Baidu), accesos rápidos, marcadores, historial, navegación privada. En el Mac: pestañas, descargas a Archivero y guardar página como PDF.
- **Conexiones (Mac):** iCloud Drive, Google Drive, OneDrive, Dropbox y Box detectados automáticamente, discos externos, carpetas, y servidores SMB, FTP, WebDAV y AFP.
- **Transferir archivos por Wi‑Fi** desde el Mac (código de 4 dígitos y QR) a cualquier navegador de la red.
- **Atajos/Siri:** enlaces `#escanear`, `#grabar`, `#nota`, `#buscar=…`, `#carpeta=…`.
- **Privacidad:** código de acceso, bloqueo al salir, carpetas protegidas.

## Compilar la app de Mac
```
mac/build.sh
```
Instala `Archivero.app` en /Applications y la agrega al Dock. Los archivos viven en `iCloud Drive/Archivero`.
