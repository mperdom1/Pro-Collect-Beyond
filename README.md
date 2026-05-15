# ScanGrid OCR - ProCollect PDF Parser

Esta es una aplicación full-stack diseñada para extraer datos estructurados de reportes PDF de ProCollect Services LLC utilizando la IA de Gemini.

## 🚀 Despliegue en AWS Amplify

Esta app incluye:
- Frontend React/Vite
- Backend Express en `server.ts`

Importante: si usas **Amplify Hosting estático**, Amplify solo sirve archivos de `dist` y **no ejecuta** `server.ts`.

### Pasos para el despliegue:

1. **Subir a GitHub**: Exporta este código a un repositorio de GitHub.
2. **Conectar con Amplify**:
   - Ve a la consola de [AWS Amplify](https://console.aws.amazon.com/amplify).
   - Haz clic en "Create new app" y selecciona "GitHub".
   - Elige tu repositorio y la rama principal.
3. **Configurar Variables de Entorno del frontend**:
   - Durante el proceso de configuración en Amplify, ve a la sección de **Environment Variables**.
   - Agrega la siguiente variable:
     - `VITE_API_BASE_URL`: URL pública de tu backend (por ejemplo, App Runner, API Gateway o EC2), sin slash final.
   - Ejemplo: `https://api.tudominio.com`
4. **Desplegar backend por separado**:
   - Publica el servidor Express (`server.ts`) en un servicio Node.js (App Runner, Elastic Beanstalk, ECS, EC2, etc.).
   - Define en ese backend la variable `GEMINI_API_KEY`.
   - Define también `CORS_ORIGIN` con la URL de tu frontend Amplify (por ejemplo, `https://main.xxxxxx.amplifyapp.com`).
   - Asegúrate de exponer `POST /api/extract` y `GET /api/health`.
5. **Build Settings**:
   - Amplify detectará automáticamente el archivo `amplify.yml` incluido en este repositorio. No necesitas cambiar nada aquí.
6. **¡Listo!**: Haz clic en "Save and deploy". Amplify compilará y publicará el frontend.

## 🛠️ Tecnologías utilizadas

- **Frontend**: React 19, Vite, Tailwind CSS 4, Lucide React, Motion.
- **Backend**: Express (Node.js), esbuild (para bundling de servidor, desplegado aparte del frontend estático).
- **IA**: Google Gemini API (modelo `gemini-1.5-flash` para procesamiento optimizado).
- **Utilidades**: `xlsx` para generación de reportes Excel.

## 📦 Scripts disponibles

- `npm run dev`: Inicia el servidor de desarrollo (frontend + backend).
- `npm run build`: Compila la aplicación para producción (genera la carpeta `dist/`).
- `npm start`: Inicia la aplicación compilada (requiere `npm run build` previo).

## 📄 Licencia

MIT
