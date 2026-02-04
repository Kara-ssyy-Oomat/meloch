// ==================== МОДУЛЬ ГАЛЕРЕИ ====================

// Определяем мобильное устройство для прокси
const GALLERY_IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const GALLERY_IS_ANDROID = /Android/.test(navigator.userAgent);
const GALLERY_IS_MOBILE = GALLERY_IS_IOS || GALLERY_IS_ANDROID;

// Функция получения URL - прямой URL
function getGalleryImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url;
}

// Функция обработки ошибки галереи
function handleGalleryImageError(img, originalUrl) {
  if (typeof window.handleImageError === 'function') {
    window.handleImageError(img, originalUrl);
  } else {
    img.src = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#f0f0f0" width="200" height="200"/><text fill="#999" x="100" y="100" text-anchor="middle">📷</text></svg>'
    );
  }
}

// Показать галерею товара
function showProductGallery(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  // Собираем все фото
  const allPhotos = [product.image];
  if (product.extraImages && Array.isArray(product.extraImages)) {
    allPhotos.push(...product.extraImages);
  }
  
  if (allPhotos.length <= 1) {
    // Если только одно фото, просто показываем его
    showImageModal(product.image, product.title);
    return;
  }
  
  // Создаем галерею
  let currentIndex = 0;
  
  const galleryHtml = `
    <div style="position:relative; text-align:center;">
      <img id="galleryMainImg" referrerpolicy="no-referrer" data-original-url="${allPhotos[0]}" src="${getGalleryImageUrl(allPhotos[0])}" alt="${product.title || ''}" onerror="handleGalleryImageError(this, '${allPhotos[0]}')" style="max-width:100%; max-height:400px; border-radius:12px; margin-bottom:15px;">
      <div style="position:absolute; top:50%; left:10px; transform:translateY(-50%);">
        <button onclick="galleryPrev()" style="background:rgba(0,0,0,0.5); color:white; border:none; width:40px; height:40px; border-radius:50%; cursor:pointer; font-size:20px;">❮</button>
      </div>
      <div style="position:absolute; top:50%; right:10px; transform:translateY(-50%);">
        <button onclick="galleryNext()" style="background:rgba(0,0,0,0.5); color:white; border:none; width:40px; height:40px; border-radius:50%; cursor:pointer; font-size:20px;">❯</button>
      </div>
      <div id="galleryThumbnails" style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:10px;">
        ${allPhotos.map((url, idx) => `
          <img referrerpolicy="no-referrer" data-original-url="${url}" src="${getGalleryImageUrl(url)}" onclick="galleryGoTo(${idx})" onerror="handleGalleryImageError(this, '${url}')" style="width:50px; height:50px; object-fit:cover; border-radius:6px; cursor:pointer; border:${idx === 0 ? '3px solid #ff6b35' : '2px solid #ddd'};" class="gallery-thumb-item" data-index="${idx}">
        `).join('')}
      </div>
      <div style="margin-top:10px; color:#666; font-size:13px;">
        <span id="galleryCounter">1</span> / ${allPhotos.length}
      </div>
    </div>
  `;
  
  // Сохраняем данные для навигации (оригинальные URL)
  window.galleryPhotos = allPhotos;
  window.galleryCurrentIndex = 0;
  
  Swal.fire({
    title: product.title || 'Галерея',
    html: galleryHtml,
    width: 600,
    showCloseButton: true,
    showConfirmButton: false,
    customClass: {
      popup: 'gallery-popup'
    }
  });
}

// Навигация по галерее
function galleryPrev() {
  if (!window.galleryPhotos) return;
  window.galleryCurrentIndex--;
  if (window.galleryCurrentIndex < 0) {
    window.galleryCurrentIndex = window.galleryPhotos.length - 1;
  }
  updateGalleryView();
}

function galleryNext() {
  if (!window.galleryPhotos) return;
  window.galleryCurrentIndex++;
  if (window.galleryCurrentIndex >= window.galleryPhotos.length) {
    window.galleryCurrentIndex = 0;
  }
  updateGalleryView();
}

function galleryGoTo(index) {
  if (!window.galleryPhotos) return;
  window.galleryCurrentIndex = index;
  updateGalleryView();
}

function updateGalleryView() {
  const mainImg = document.getElementById('galleryMainImg');
  const counter = document.getElementById('galleryCounter');
  const thumbs = document.querySelectorAll('.gallery-thumb-item');
  
  if (mainImg && window.galleryPhotos) {
    const originalUrl = window.galleryPhotos[window.galleryCurrentIndex];
    mainImg.src = getGalleryImageUrl(originalUrl);
    mainImg.dataset.originalUrl = originalUrl;
  }
  
  if (counter) {
    counter.textContent = window.galleryCurrentIndex + 1;
  }
  
  thumbs.forEach((thumb, idx) => {
    thumb.style.border = idx === window.galleryCurrentIndex ? '3px solid #ff6b35' : '2px solid #ddd';
  });
}

// Функция для редактирования дополнительных фото существующего товара
async function showEditExtraPhotosModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  const currentPhotos = product.extraImages || [];
  
  let photosHtml = currentPhotos.map((url, idx) => `
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;" id="editExtraPhoto_${idx}">
      <img src="${url}" style="width:50px; height:50px; object-fit:cover; border-radius:6px;">
      <input type="text" value="${url}" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px; font-size:12px;" id="editExtraPhotoUrl_${idx}">
      <button type="button" onclick="document.getElementById('editExtraPhoto_${idx}').remove()" style="background:#dc3545; color:white; border:none; width:30px; height:30px; border-radius:6px; cursor:pointer;">✕</button>
    </div>
  `).join('');
  
  if (currentPhotos.length === 0) {
    photosHtml = '<p style="color:#666; ">Дополнительных фото нет</p>';
  }
  
  const { value: formValues } = await Swal.fire({
    title: '📷 Дополнительные фото',
    html: `
      <div style="text-align:left; max-height:300px; overflow-y:auto;">
        <div id="editExtraPhotosContainer">${photosHtml}</div>
        <hr style="margin:15px 0;">
        <div style="margin-bottom:10px; font-weight:600;">Добавить новое фото:</div>
        <div style="display:flex; gap:8px; margin-bottom:10px;">
          <input type="file" id="newExtraPhotoFile" accept="image/*" style="flex:1; padding:8px; border:1px solid #2196f3; border-radius:6px;">
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="newExtraPhotoUrl" placeholder="Или вставьте URL фото" style="flex:1; padding:8px; border:1px solid #2196f3; border-radius:6px;">
          <button type="button" onclick="addNewExtraPhotoToEdit()" style="background:#2196f3; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">+</button>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Сохранить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#28a745',
    width: '500px',
    preConfirm: () => {
      // Собираем все URL из полей
      const urls = [];
      document.querySelectorAll('[id^="editExtraPhotoUrl_"]').forEach(input => {
        const url = input.value.trim();
        if (url) urls.push(url);
      });
      return urls;
    }
  });
  
  if (formValues !== undefined) {
    try {
      // Сохраняем обновленный массив фото
      await db.collection('products').doc(productId).update({
        extraImages: formValues
      });
      
      // Обновляем локально
      product.extraImages = formValues;
      renderProducts();
      
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Фото обновлены!',
        showConfirmButton: false,
        timer: 1500
      });
    } catch (error) {
      console.error('Ошибка обновления фото:', error);
      Swal.fire('Ошибка', 'Не удалось обновить фото', 'error');
    }
  }
}

// Временное хранилище для нового фото при редактировании
window.newExtraPhotoForEdit = null;

// Добавить новое фото в редактор
async function addNewExtraPhotoToEdit() {
  const fileInput = document.getElementById('newExtraPhotoFile');
  const urlInput = document.getElementById('newExtraPhotoUrl');
  const container = document.getElementById('editExtraPhotosContainer');
  
  let newUrl = '';
  
  if (fileInput.files && fileInput.files[0]) {
    // Загружаем файл на Firebase Storage (постоянное хранение)
    try {
      Swal.showLoading();
      newUrl = await uploadToFirebaseStorage(fileInput.files[0], 'extra_photos');
      Swal.hideLoading();
    } catch (error) {
      console.error('Ошибка загрузки:', error);
      Swal.fire('Ошибка', 'Не удалось загрузить фото', 'error');
      return;
    }
  } else if (urlInput.value.trim()) {
    newUrl = urlInput.value.trim();
  }
  
  if (!newUrl) return;
  
  // Считаем текущее количество фото
  const currentCount = container.querySelectorAll('[id^="editExtraPhoto_"]').length;
  const idx = Date.now(); // Уникальный ID
  
  // Удаляем текст "Дополнительных фото нет" если он есть
  const noPhotosText = container.querySelector('p');
  if (noPhotosText) noPhotosText.remove();
  
  // Добавляем новое фото
  const photoDiv = document.createElement('div');
  photoDiv.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:8px;';
  photoDiv.id = `editExtraPhoto_${idx}`;
  photoDiv.innerHTML = `
    <img src="${newUrl}" style="width:50px; height:50px; object-fit:cover; border-radius:6px;">
    <input type="text" value="${newUrl}" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px; font-size:12px;" id="editExtraPhotoUrl_${idx}">
    <button type="button" onclick="document.getElementById('editExtraPhoto_${idx}').remove()" style="background:#dc3545; color:white; border:none; width:30px; height:30px; border-radius:6px; cursor:pointer;">✕</button>
  `;
  
  container.appendChild(photoDiv);
  
  // Очищаем поля ввода
  fileInput.value = '';
  urlInput.value = '';
}

// Показать превью изображения
function showPreview(src) {
  document.getElementById('previewImg').src = src;
  document.getElementById('previewBlock').style.display = 'block';
  lockPageScroll();
}

// Функция для показа увеличенного фото
function showImageModal(imageUrl, title) {
  const previewBlock = document.getElementById('previewBlock');
  const previewImg = document.getElementById('previewImg');
  const previewCaption = document.getElementById('previewCaption');
  const closePreview = document.getElementById('closePreview');
  
  if (previewBlock && previewImg) {
    previewImg.src = imageUrl;
    if (previewCaption) {
      previewCaption.textContent = title || '';
    }
    previewBlock.style.display = 'flex';
    previewBlock.style.alignItems = 'center';
    previewBlock.style.justifyContent = 'center';
    
    // Закрытие по клику на фон
    previewBlock.onclick = function(e) {
      if (e.target === previewBlock) {
        previewBlock.style.display = 'none';
        unlockPageScroll();
      }
    };
    
    // Закрытие по кнопке
    if (closePreview) {
      closePreview.onclick = function() {
        previewBlock.style.display = 'none';
        unlockPageScroll();
      };
    }
    
    // Закрытие по Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        previewBlock.style.display = 'none';
        unlockPageScroll();
      }
    });
    
    lockPageScroll();
  }
}

