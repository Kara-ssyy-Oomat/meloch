// ===========================================
// Модуль загрузки изображений (upload)
// ===========================================

// Добавляем функцию для проверки и исправления URL изображений
function fixImageUrl(url) {
  if (!url) return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="18"%3EНет фото%3C/text%3E%3C/svg%3E';
  
  // Если это просто имя файла (без пути)
  if (!url.includes('/') && !url.startsWith('http')) {
    // Добавляем путь к локальной директории с изображениями
    return './images/' + url;
  }
  
  return url;
}

// === Исправление ориентации изображения (EXIF) ===
async function fixImageOrientation(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        console.log('🖼️ Загружено изображение:', file.name, `${img.naturalWidth}x${img.naturalHeight}`);
        
        // Получаем EXIF ориентацию
        EXIF.getData(img, function() {
          const orientation = EXIF.getTag(this, "Orientation") || 1;
          console.log('📐 EXIF Orientation:', orientation);
          
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          let width = img.naturalWidth;
          let height = img.naturalHeight;
          
          // Для ориентаций 5-8 меняем ширину и высоту местами
          if (orientation > 4 && orientation < 9) {
            canvas.width = height;
            canvas.height = width;
          } else {
            canvas.width = width;
            canvas.height = height;
          }
          
          console.log('🎨 Canvas размер:', canvas.width, 'x', canvas.height);
          
          // Применяем трансформации в зависимости от ориентации
          ctx.save();
          
          switch (orientation) {
            case 2:
              // horizontal flip
              ctx.translate(width, 0);
              ctx.scale(-1, 1);
              break;
            case 3:
              // 180° rotate
              ctx.translate(width, height);
              ctx.rotate(Math.PI);
              break;
            case 4:
              // vertical flip
              ctx.translate(0, height);
              ctx.scale(1, -1);
              break;
            case 5:
              // vertical flip + 90° rotate
              ctx.rotate(0.5 * Math.PI);
              ctx.scale(1, -1);
              break;
            case 6:
              // 90° rotate right
              ctx.rotate(0.5 * Math.PI);
              ctx.translate(0, -height);
              break;
            case 7:
              // horizontal flip + 90° rotate
              ctx.rotate(0.5 * Math.PI);
              ctx.translate(width, -height);
              ctx.scale(-1, 1);
              break;
            case 8:
              // 90° rotate left
              ctx.rotate(-0.5 * Math.PI);
              ctx.translate(-width, 0);
              break;
            default:
              // Ориентация 1 или не определена - ничего не делаем
              break;
          }
          
          // Рисуем изображение с примененной трансформацией
          ctx.drawImage(img, 0, 0, width, height);
          ctx.restore();
          
          console.log('✅ Изображение перерисовано с ориентацией:', orientation);
          
          // Конвертируем canvas обратно в blob
          canvas.toBlob((blob) => {
            if (blob) {
              const fixedFile = new File([blob], file.name, {
                type: file.type || 'image/jpeg',
                lastModified: Date.now()
              });
              console.log('✅ Создан исправленный файл:', Math.round(fixedFile.size / 1024), 'KB');
              resolve(fixedFile);
            } else {
              console.warn('⚠️ Не удалось создать blob, используем оригинал');
              resolve(file);
            }
          }, file.type || 'image/jpeg', 0.92);
        });
      };
      
      img.onerror = (error) => {
        console.error('❌ Ошибка загрузки изображения:', error);
        resolve(file);
      };
      
      img.src = e.target.result;
    };
    
    reader.onerror = (error) => {
      console.error('❌ Ошибка чтения файла:', error);
      resolve(file);
    };
    
    reader.readAsDataURL(file);
  });
}

// === Cloudinary upload helper ===
async function uploadToCloudinary(file) {
  console.log('📤 Начинаем загрузку на Cloudinary:', file.name);
  
  // Сначала исправляем ориентацию изображения
  const fixedFile = await fixImageOrientation(file);
  console.log('📤 Загружаем исправленный файл на Cloudinary');
  
  const cloudName = 'dya0j6wgv';
  const uploadPreset = 'mystore_upload';

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const formData = new FormData();
  formData.append('file', fixedFile);
  formData.append('upload_preset', uploadPreset);

  const res = await fetch(url, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (data.secure_url) {
    console.log('✅ Файл успешно загружен на Cloudinary:', data.secure_url);
    return data.secure_url;
  } else {
    throw new Error('Ошибка загрузки на Cloudinary: ' + (data.error?.message || 'Неизвестная ошибка'));
  }
}

// === Firebase Storage upload helper (постоянное хранение) ===
async function uploadToFirebaseStorage(file, folder = 'products') {
  console.log('📤 Начинаем загрузку на Firebase Storage:', file.name);
  
  // Сначала исправляем ориентацию изображения
  const fixedFile = await fixImageOrientation(file);
  console.log('📤 Загружаем исправленный файл на Firebase Storage');
  
  // Генерируем уникальное имя файла
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const extension = file.name.split('.').pop() || 'jpg';
  const fileName = `${folder}/${timestamp}_${randomId}.${extension}`;
  
  // Загружаем на Firebase Storage
  const storageRef = storage.ref(fileName);
  const snapshot = await storageRef.put(fixedFile);
  
  // Получаем постоянную ссылку
  const downloadURL = await snapshot.ref.getDownloadURL();
  console.log('✅ Файл успешно загружен на Firebase Storage:', downloadURL);
  
  return downloadURL;
}
