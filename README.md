# ScanGrid OCR - ProCollect PDF Parser

Esta es una aplicación full-stack diseñada para extraer datos estructurados de reportes PDF de ProCollect Services LLC utilizando la IA de Gemini.

## 🚀 Despliegue en AWS Amplify (One-Click Ready)

Esta aplicación está configurada para desplegarse directamente en **AWS Amplify Hosting** como una aplicación Web Dynamic (SSR).

### Pasos para el despliegue:

1. **Subir a GitHub**: Exporta este código a un repositorio de GitHub.
2. **Conectar con Amplify**:
   - Ve a la consola de [AWS Amplify](https://console.aws.amazon.com/amplify).
   - Haz clic en "Create new app" y selecciona "GitHub".
   - Elige tu repositorio y la rama principal.
3. **Configurar Variables de Entorno**:
   - Durante el proceso de configuración en Amplify, ve a la sección de **Environment Variables**.
   - Agrega la siguiente variable:
     - `GEMINI_API_KEY`: Tu llave de API de Google AI Studio.
4. **Build Settings**:
   - Amplify detectará automáticamente el archivo `amplify.yml` incluido en este repositorio. No necesitas cambiar nada aquí.
5. **¡Listo!**: Haz clic en "Save and deploy". Amplify compilará el frontend con Vite y el backend con esbuild, y servirá la app en una URL pública.

## 🛠️ Tecnologías utilizadas

- **Frontend**: React 19, Vite, Tailwind CSS 4, Lucide React, Motion.
- **Backend**: Express (Node.js), esbuild (para bundling de servidor).
- **IA**: Google Gemini API (modelo `gemini-1.5-flash` para procesamiento optimizado).
- **Utilidades**: `xlsx` para generación de reportes Excel.

## 📦 Scripts disponibles

- `npm run dev`: Inicia el servidor de desarrollo (frontend + backend).
- `npm run build`: Compila la aplicación para producción (genera la carpeta `dist/`).
- `npm start`: Inicia la aplicación compilada (requiere `npm run build` previo).

## 📄 Licencia

MIT
