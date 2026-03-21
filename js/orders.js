// ==================== МОДУЛЬ ЗАКАЗОВ ====================

// Сжатие изображения для встраивания в PDF (маленький размер, JPEG)
function compressImageForPDF(base64Data, maxDim, quality) {
  maxDim = maxDim || 200;
  quality = quality || 0.6;
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var w = img.width;
      var h = img.height;
      if (w > maxDim || h > maxDim) {
        var s = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      var c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve({ data: c.toDataURL('image/jpeg', quality), width: w, height: h });
    };
    img.onerror = function() { resolve(null); };
    img.src = base64Data;
  });
}

// Оптимизация URL Cloudinary — запрос маленького изображения с сервера
function getSmallImageUrl(url, width) {
  width = width || 200;
  if (url && url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/w_' + width + ',q_70,f_jpg/');
  }
  return url;
}

// Функция отправки заказа как PDF файл в Telegram
async function sendOrderAsPDF(name, phone, address, driverName, driverPhone, cartItems, total, time) {
  try {
    console.log('=== Начало создания PDF файла ===');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let yPosition = 20;
    
    // Заголовок
    const headerCanvas = document.createElement('canvas');
    const headerCtx = headerCanvas.getContext('2d');
    headerCanvas.width = 600;
    headerCanvas.height = 50;
    
    headerCtx.fillStyle = 'white';
    headerCtx.fillRect(0, 0, 600, 50);
    headerCtx.fillStyle = 'black';
    headerCtx.font = 'bold 24px Arial';
    headerCtx.textAlign = 'center';
    headerCtx.fillText('НОВЫЙ ЗАКАЗ', 300, 35);
    
    const headerImage = headerCanvas.toDataURL('image/jpeg', 0.85);
    doc.addImage(headerImage, 'JPEG', 20, yPosition, 170, 15);
    
    yPosition += 20;
    
    // Определяем высоту блока информации (больше, если есть водитель)
    const hasDriver = driverName || driverPhone;
    const infoHeight = hasDriver ? 170 : 120;
    
    // Информация о заказе в рамке
    const infoCanvas = document.createElement('canvas');
    const infoCtx = infoCanvas.getContext('2d');
    infoCanvas.width = 700;
    infoCanvas.height = infoHeight;
    
    // Белый фон с черной рамкой
    infoCtx.fillStyle = 'white';
    infoCtx.fillRect(0, 0, 700, infoHeight);
    infoCtx.strokeStyle = 'black';
    infoCtx.lineWidth = 2;
    infoCtx.strokeRect(0, 0, 700, infoHeight);
    
    // Текст
    infoCtx.fillStyle = 'black';
    infoCtx.font = '16px Arial';
    infoCtx.fillText(`Дата/Время: ${time}`, 15, 30);
    infoCtx.fillText(`Имя клиента: ${name}`, 15, 55);
    infoCtx.fillText(`Телефон: ${phone}`, 15, 80);
    infoCtx.fillText(`Адрес: ${address}`, 15, 105);
    
    // Добавляем информацию о водителе, если она есть
    if (hasDriver) {
      infoCtx.fillText(`Водитель: ${driverName || '-'}`, 15, 130);
      infoCtx.fillText(`Тел. водителя: ${driverPhone || '-'}`, 15, 155);
    }
    
    const infoImage = infoCanvas.toDataURL('image/jpeg', 0.85);
    const infoImageHeight = hasDriver ? 42 : 30;
    doc.addImage(infoImage, 'JPEG', 20, yPosition, 170, infoImageHeight);
    
    yPosition += infoImageHeight + 5;
    
    // Заголовок таблицы с сеткой
    const tableHeaderCanvas = document.createElement('canvas');
    const thCtx = tableHeaderCanvas.getContext('2d');
    tableHeaderCanvas.width = 550;
    tableHeaderCanvas.height = 50;
    
    // Серый фон для заголовка
    thCtx.fillStyle = '#e0e0e0';
    thCtx.fillRect(0, 0, 550, 50);
    
    // Рамка
    thCtx.strokeStyle = 'black';
    thCtx.lineWidth = 2;
    thCtx.strokeRect(0, 0, 550, 50);
    
    // Вертикальные линии (колонки: Фото | Название | Кол-во | Цена | Сумма)
    thCtx.beginPath();
    thCtx.moveTo(70, 0);
    thCtx.lineTo(70, 50);
    thCtx.moveTo(270, 0);
    thCtx.lineTo(270, 50);
    thCtx.moveTo(410, 0);
    thCtx.lineTo(410, 50);
    thCtx.moveTo(480, 0);
    thCtx.lineTo(480, 50);
    thCtx.stroke();
    
    // Текст заголовков
    thCtx.fillStyle = 'black';
    thCtx.font = 'bold 14px Arial';
    thCtx.textAlign = 'center';
    thCtx.fillText('ФОТО', 35, 32);
    thCtx.fillText('НАЗВАНИЕ', 170, 32);
    thCtx.fillText('КОЛ-ВО', 340, 32);
    thCtx.fillText('ЦЕНА', 445, 32);
    thCtx.fillText('СУММА', 515, 32);
    
    const tableHeaderImage = tableHeaderCanvas.toDataURL('image/jpeg', 0.85);
    doc.addImage(tableHeaderImage, 'JPEG', 20, yPosition, 170, 12);
    
    yPosition += 12;
    
    // Товары с сеткой
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      
      // Проверяем, не выходим ли за страницу
      if (yPosition > 240) {
        doc.addPage();
        yPosition = 20;
      }
      
      // Загружаем фото и определяем его размеры
      let photoWidth = 90;  // По умолчанию
      let photoHeight = 90;
      let photoData = null;
      
      if (item.image && item.image.startsWith('http')) {
        try {
          // Оптимизация: загружаем уменьшенное изображение с сервера
          const optimizedUrl = getSmallImageUrl(item.image, 200);
          const response = await fetch(optimizedUrl);
          const blob = await response.blob();
          
          const reader = new FileReader();
          const base64 = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          
          // Сжимаем изображение для PDF (макс 200px, JPEG 0.6)
          const compressed = await compressImageForPDF(base64, 200, 0.6);
          if (compressed) {
            photoData = compressed.data;
            photoWidth = compressed.width;
            photoHeight = compressed.height;
          }
          
          console.log('✓ Фото сжато для PDF:', item.title, `${photoWidth}x${photoHeight}`);
        } catch (err) {
          console.error('✗ Ошибка фото:', item.title, err);
          photoWidth = 90;
          photoHeight = 90;
        }
      }
      
      // Высота строки = высота фото + отступы
      const rowHeight = Math.max(photoHeight + 10, 100);
      
      // Создаем строку таблицы с динамической шириной
      const rowCanvas = document.createElement('canvas');
      const rowCtx = rowCanvas.getContext('2d');
      const photoColumnWidth = Math.max(photoWidth + 10, 70); // Ширина колонки фото
      const totalWidth = photoColumnWidth + 480; // фото + остальные колонки
      rowCanvas.width = totalWidth;
      rowCanvas.height = rowHeight;
      
      // Белый фон
      rowCtx.fillStyle = 'white';
      rowCtx.fillRect(0, 0, totalWidth, rowHeight);
      
      // Рамка строки
      rowCtx.strokeStyle = 'black';
      rowCtx.lineWidth = 2;
      rowCtx.strokeRect(0, 0, totalWidth, rowHeight);
      
      // Вертикальные линии (расширяем колонку количества)
      const col2 = photoColumnWidth;
      const col3 = photoColumnWidth + 200;  // Название уже
      const col4 = photoColumnWidth + 340;  // Количество шире (140px)
      const col5 = photoColumnWidth + 410;  // Цена
      
      rowCtx.beginPath();
      rowCtx.moveTo(col2, 0);
      rowCtx.lineTo(col2, rowHeight);
      rowCtx.moveTo(col3, 0);
      rowCtx.lineTo(col3, rowHeight);
      rowCtx.moveTo(col4, 0);
      rowCtx.lineTo(col4, rowHeight);
      rowCtx.moveTo(col5, 0);
      rowCtx.lineTo(col5, rowHeight);
      rowCtx.stroke();
      
      // Текст в ячейках
      rowCtx.fillStyle = 'black';
      rowCtx.font = '13px Arial';
      rowCtx.textAlign = 'center';
      
      const midY = rowHeight / 2;
      
      // Название (с переносом если длинное) + вариант
      rowCtx.textAlign = 'left';
      const title = item.title;
      const variantText = item.variantName ? ` [${item.variantName}]` : '';
      const fullTitle = title + variantText;
      // Определяем единицу измерения для товара (берём из item или из product)
      const product = products.find(p => p.id === item.id);
      const isPack = item.isPack || (product && product.isPack) || false;
      const unitLabel = isPack ? 'пач' : 'шт';
      const unitsPerBox = item.unitsPerBox || (product && product.unitsPerBox) || 72;
      
      // Рассчитываем количество коробок
      const boxCount = Math.floor(item.qty / unitsPerBox);
      const remainingUnits = item.qty % unitsPerBox;
      
      // Формируем строку количества в коробках (короткий формат)
      let qtyLine1 = '';
      let qtyLine2 = '';
      if (boxCount > 0 && remainingUnits === 0) {
        // Целое число коробок
        qtyLine1 = `${boxCount} кор`;
        qtyLine2 = `(${unitsPerBox} ${unitLabel})`;
      } else if (boxCount > 0 && remainingUnits > 0) {
        // Коробки + остаток
        qtyLine1 = `${boxCount} кор`;
        qtyLine2 = `+${remainingUnits} ${unitLabel}`;
      } else {
        // Только штуки (меньше коробки)
        qtyLine1 = `${item.qty} ${unitLabel}`;
        qtyLine2 = '';
      }
      
      if (fullTitle.length > 28) {
        rowCtx.fillText(fullTitle.substring(0, 28), col2 + 5, midY - 5);
        rowCtx.fillText(fullTitle.substring(28), col2 + 5, midY + 10);
      } else {
        rowCtx.fillText(fullTitle, col2 + 5, midY);
      }
      
      // Количество (в коробках, две строки)
      rowCtx.textAlign = 'center';
      rowCtx.font = 'bold 12px Arial';
      rowCtx.fillText(qtyLine1, (col3 + col4) / 2, midY - 5);
      if (qtyLine2) {
        rowCtx.font = '11px Arial';
        rowCtx.fillText(qtyLine2, (col3 + col4) / 2, midY + 10);
      }
      rowCtx.font = '13px Arial';
      
      // Цена
      rowCtx.fillText(`${item.price}`, (col4 + col5) / 2, midY - 5);
      rowCtx.font = '11px Arial';
      rowCtx.fillText('сом', (col4 + col5) / 2, midY + 8);
      
      // Сумма
      rowCtx.font = 'bold 13px Arial';
      rowCtx.fillText(`${item.qty * item.price}`, (col5 + totalWidth) / 2, midY - 5);
      rowCtx.font = '11px Arial';
      rowCtx.fillText('сом', (col5 + totalWidth) / 2, midY + 8);
      
      const rowImage = rowCanvas.toDataURL('image/jpeg', 0.85);
      const rowPdfHeight = rowHeight * 170 / totalWidth; // Пропорционально
      doc.addImage(rowImage, 'JPEG', 20, yPosition, 170, rowPdfHeight);
      
      // Добавляем фото товара поверх ячейки - ПОЛНОЕ фото без обрезки
      if (photoData) {
        const photoWidthPdf = photoWidth * 170 / totalWidth;
        const photoHeightPdf = photoHeight * 170 / totalWidth;
        const xPos = 22 + (photoColumnWidth * 170 / totalWidth - photoWidthPdf) / 2; // Центрируем
        const yPos = yPosition + (rowPdfHeight - photoHeightPdf) / 2; // Центрируем
        doc.addImage(photoData, 'JPEG', xPos, yPos, photoWidthPdf, photoHeightPdf);
      }
      
      yPosition += rowPdfHeight;
    }
    
    // Строка ИТОГО с сеткой
    const totalCanvas = document.createElement('canvas');
    const totalCtx = totalCanvas.getContext('2d');
    totalCanvas.width = 550;
    totalCanvas.height = 60;
    
    // Желтый фон для итого
    totalCtx.fillStyle = '#fff9c4';
    totalCtx.fillRect(0, 0, 550, 60);
    
    // Рамка
    totalCtx.strokeStyle = 'black';
    totalCtx.lineWidth = 3;
    totalCtx.strokeRect(0, 0, 550, 60);
    
    // Вертикальная линия
    totalCtx.beginPath();
    totalCtx.moveTo(470, 0);
    totalCtx.lineTo(470, 60);
    totalCtx.stroke();
    
    // Текст
    totalCtx.fillStyle = 'black';
    totalCtx.font = 'bold 18px Arial';
    totalCtx.textAlign = 'right';
    totalCtx.fillText('ИТОГО:', 450, 38);
    
    totalCtx.textAlign = 'center';
    totalCtx.fillText(`${total}`, 510, 32);
    totalCtx.font = '14px Arial';
    totalCtx.fillText('сом', 510, 48);
    
    const totalImage = totalCanvas.toDataURL('image/jpeg', 0.85);
    doc.addImage(totalImage, 'JPEG', 20, yPosition, 170, 15);
    
    console.log('Генерируем PDF файл...');
    
    // Генерируем PDF как blob
    const pdfBlob = doc.output('blob');
    
    console.log('PDF файл сгенерирован, размер:', Math.round(pdfBlob.size / 1024), 'KB');
    
    // Проверяем размер перед отправкой (Telegram лимит 50MB)
    if (pdfBlob.size > 49 * 1024 * 1024) {
      console.error('PDF слишком большой для Telegram:', Math.round(pdfBlob.size / 1024 / 1024), 'MB');
      throw new Error('PDF файл слишком большой (' + Math.round(pdfBlob.size / 1024 / 1024) + ' MB). Попробуйте уменьшить количество товаров.');
    }

    // Отправляем в Telegram
    const formData = new FormData();
    formData.append('chat_id', '5567924440');
    formData.append('document', pdfBlob, `Заказ_${name}_${Date.now()}.pdf`);
    formData.append('caption', `📷 Заказ с фото от ${name}`);

    const tgResp1 = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData
    });

    const tgData1 = await tgResp1.json().catch(() => null);
    if (!tgResp1.ok || tgData1?.ok === false) {
      console.error('Telegram sendDocument error (chat 5567924440):', tgResp1.status, tgData1);
      throw new Error(tgData1?.description || `Telegram HTTP ${tgResp1.status}`);
    }

    // Отправляем второму пользователю
    const formData2 = new FormData();
    formData2.append('chat_id', '246421345');
    formData2.append('document', pdfBlob, `Заказ_${name}_${Date.now()}.pdf`);
    formData2.append('caption', `📷 Заказ с фото от ${name}`);

    const tgResp2 = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData2
    });

    const tgData2 = await tgResp2.json().catch(() => null);
    if (!tgResp2.ok || tgData2?.ok === false) {
      console.error('Telegram sendDocument error (chat 246421345):', tgResp2.status, tgData2);
      throw new Error(tgData2?.description || `Telegram HTTP ${tgResp2.status}`);
    }

    console.log('PDF файл отправлен в Telegram');
  } catch (error) {
    console.error('Ошибка отправки PDF:', error);
  }
}

// Функция отправки заказа как PDF файл БЕЗ ФОТО (для печати) в Telegram
// ПРИМЕЧАНИЕ: Ранее называлась sendOrderAsExcel, переименована для ясности
async function sendOrderAsPrintPDF(name, phone, address, driverName, driverPhone, cartItems, total, time) {
  try {
    console.log('=== Начало создания PDF файла без фото (для печати) ===');

    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Масштаб для чёткости (1.5x - хорошее качество при минимальном размере)
    const scale = 1.5;
    
    let yPosition = 2;
    
    // Заголовок
    const headerCanvas = document.createElement('canvas');
    const headerCtx = headerCanvas.getContext('2d');
    headerCanvas.width = 600 * scale;
    headerCanvas.height = 50 * scale;
    headerCtx.scale(scale, scale);
    
    headerCtx.fillStyle = 'white';
    headerCtx.fillRect(0, 0, 600, 50);
    headerCtx.fillStyle = 'black';
    headerCtx.font = 'bold 24px Arial';
    headerCtx.textAlign = 'center';
    headerCtx.fillText('ЗАКАЗ (для печати)', 300, 35);
    
    const headerImage = headerCanvas.toDataURL('image/png');
    doc.addImage(headerImage, 'PNG', 20, yPosition, 170, 10);
    
    yPosition += 11;
    
    // Определяем высоту блока информации
    const hasDriver = driverName || driverPhone;
    const infoHeight = hasDriver ? 170 : 120;
    
    // Информация о заказе в рамке
    const infoCanvas = document.createElement('canvas');
    const infoCtx = infoCanvas.getContext('2d');
    infoCanvas.width = 700 * scale;
    infoCanvas.height = infoHeight * scale;
    infoCtx.scale(scale, scale);
    
    infoCtx.fillStyle = 'white';
    infoCtx.fillRect(0, 0, 700, infoHeight);
    infoCtx.strokeStyle = 'black';
    infoCtx.lineWidth = 2;
    infoCtx.strokeRect(0, 0, 700, infoHeight);
    
    infoCtx.fillStyle = 'black';
    infoCtx.font = '16px Arial';
    infoCtx.fillText(`Дата/Время: ${time}`, 15, 30);
    infoCtx.fillText(`Имя клиента: ${name}`, 15, 55);
    infoCtx.fillText(`Телефон: ${phone}`, 15, 80);
    infoCtx.fillText(`Адрес: ${address}`, 15, 105);
    
    if (hasDriver) {
      infoCtx.fillText(`Водитель: ${driverName || '-'}`, 15, 130);
      infoCtx.fillText(`Тел. водителя: ${driverPhone || '-'}`, 15, 155);
    }
    
    const infoImage = infoCanvas.toDataURL('image/png');
    const infoImageHeight = hasDriver ? 38 : 28;
    doc.addImage(infoImage, 'PNG', 20, yPosition, 170, infoImageHeight);
    
    yPosition += infoImageHeight + 1;
    
    // Заголовок таблицы БЕЗ колонки фото
    const tableHeaderCanvas = document.createElement('canvas');
    const thCtx = tableHeaderCanvas.getContext('2d');
    tableHeaderCanvas.width = 600 * scale;
    tableHeaderCanvas.height = 40 * scale;
    thCtx.scale(scale, scale);
    
    thCtx.fillStyle = '#e0e0e0';
    thCtx.fillRect(0, 0, 600, 40);
    
    thCtx.strokeStyle = 'black';
    thCtx.lineWidth = 2;
    thCtx.strokeRect(0, 0, 600, 40);
    
    // Вертикальные линии (колонки: Название | Кол-во | Цена | Сумма)
    thCtx.beginPath();
    thCtx.moveTo(300, 0); thCtx.lineTo(300, 40);
    thCtx.moveTo(400, 0); thCtx.lineTo(400, 40);
    thCtx.moveTo(500, 0); thCtx.lineTo(500, 40);
    thCtx.stroke();
    
    thCtx.fillStyle = 'black';
    thCtx.font = 'bold 12px Arial';
    thCtx.textAlign = 'center';
    thCtx.fillText('НАЗВАНИЕ', 150, 25);
    thCtx.fillText('КОЛ-ВО', 350, 25);
    thCtx.fillText('ЦЕНА', 450, 25);
    thCtx.fillText('СУММА', 550, 25);
    
    const tableHeaderImage = tableHeaderCanvas.toDataURL('image/png');
    doc.addImage(tableHeaderImage, 'PNG', 20, yPosition, 170, 10);
    
    yPosition += 10;
    
    // Товары БЕЗ ФОТО
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      
      // Проверяем, не выходим ли за страницу
      if (yPosition > 265) {
        doc.addPage();
        yPosition = 15;
      }
      
      const product = products.find(p => p.id === item.id);
      const isPack = item.isPack || (product && product.isPack) || false;
      const unitLabel = isPack ? 'пач' : 'шт';
      const unitsPerBox = item.unitsPerBox || (product && product.unitsPerBox) || 72;
      
      // Рассчитываем количество коробок
      const boxCount = Math.floor(item.qty / unitsPerBox);
      const remainingUnits = item.qty % unitsPerBox;
      
      // Формируем строку количества коробок
      let boxText = '';
      if (boxCount > 0 && remainingUnits === 0) {
        boxText = `${boxCount} кор`;
      } else if (boxCount > 0 && remainingUnits > 0) {
        boxText = `${boxCount} кор +${remainingUnits}`;
      } else {
        boxText = `${item.qty} ${unitLabel}`;
      }
      
      // Название с вариантом
      const titleWithVariant = item.variantName ? `${item.title} [${item.variantName}]` : item.title;
      
      // Создаем строку таблицы с высоким разрешением
      const rowCanvas = document.createElement('canvas');
      const rowCtx = rowCanvas.getContext('2d');
      rowCanvas.width = 600 * scale;
      rowCanvas.height = 35 * scale;
      rowCtx.scale(scale, scale);
      
      rowCtx.fillStyle = i % 2 === 0 ? 'white' : '#f9f9f9';
      rowCtx.fillRect(0, 0, 600, 35);
      
      rowCtx.strokeStyle = 'black';
      rowCtx.lineWidth = 1;
      rowCtx.strokeRect(0, 0, 600, 35);
      
      // Вертикальные линии (4 колонки)
      rowCtx.beginPath();
      rowCtx.moveTo(300, 0); rowCtx.lineTo(300, 35);
      rowCtx.moveTo(400, 0); rowCtx.lineTo(400, 35);
      rowCtx.moveTo(500, 0); rowCtx.lineTo(500, 35);
      rowCtx.stroke();
      
      rowCtx.fillStyle = 'black';
      rowCtx.font = '11px Arial';
      
      // Название (слева)
      rowCtx.textAlign = 'left';
      if (titleWithVariant.length > 40) {
        rowCtx.fillText(titleWithVariant.substring(0, 40), 5, 15);
        rowCtx.fillText(titleWithVariant.substring(40, 80), 5, 28);
      } else {
        rowCtx.fillText(titleWithVariant, 5, 22);
      }
      
      rowCtx.textAlign = 'center';
      rowCtx.fillText(boxText, 350, 22);
      rowCtx.fillText(`${item.price} сом`, 450, 22);
      rowCtx.font = 'bold 11px Arial';
      rowCtx.fillText(`${item.qty * item.price} сом`, 550, 22);
      
      const rowImage = rowCanvas.toDataURL('image/png');
      doc.addImage(rowImage, 'PNG', 20, yPosition, 170, 9);
      
      yPosition += 9;
    }
    
    // Строка ИТОГО - на всю ширину таблицы с высоким разрешением
    const totalCanvas = document.createElement('canvas');
    const totalCtx = totalCanvas.getContext('2d');
    totalCanvas.width = 800 * scale;
    totalCanvas.height = 60 * scale;
    totalCtx.scale(scale, scale);
    
    // Яркий жёлтый фон
    totalCtx.fillStyle = '#ffeb3b';
    totalCtx.fillRect(0, 0, 800, 60);
    
    // Толстая чёрная рамка
    totalCtx.strokeStyle = 'black';
    totalCtx.lineWidth = 4;
    totalCtx.strokeRect(0, 0, 800, 60);
    
    // Текст ИТОГО справа с отступом
    totalCtx.fillStyle = 'black';
    totalCtx.font = 'bold 24px Arial';
    totalCtx.textAlign = 'right';
    totalCtx.fillText(`ИТОГО:  ${total} сом`, 780, 40);
    
    const totalImage = totalCanvas.toDataURL('image/png');
    doc.addImage(totalImage, 'PNG', 20, yPosition, 170, 14);
    
    console.log('Генерируем PDF файл без фото...');
    
    // Генерируем PDF как blob
    const pdfBlob = doc.output('blob');
    
    console.log('PDF файл без фото сгенерирован, размер:', pdfBlob.size, 'байт');
    
    // Отправляем в Telegram
    const formData = new FormData();
    formData.append('chat_id', '5567924440');
    formData.append('document', pdfBlob, `Заказ_печать_${name}_${Date.now()}.pdf`);
    formData.append('caption', `📄 Заказ для печати от ${name}`);

    const tgResp1 = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData
    });

    const tgData1 = await tgResp1.json().catch(() => null);
    if (!tgResp1.ok || tgData1?.ok === false) {
      console.error('Telegram sendDocument error (chat 5567924440):', tgResp1.status, tgData1);
      throw new Error(tgData1?.description || `Telegram HTTP ${tgResp1.status}`);
    }

    // Отправляем второму пользователю
    const formData2 = new FormData();
    formData2.append('chat_id', '246421345');
    formData2.append('document', pdfBlob, `Заказ_печать_${name}_${Date.now()}.pdf`);
    formData2.append('caption', `📄 Заказ для печати от ${name}`);

    const tgResp2 = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData2
    });

    const tgData2 = await tgResp2.json().catch(() => null);
    if (!tgResp2.ok || tgData2?.ok === false) {
      console.error('Telegram sendDocument error (chat 246421345):', tgResp2.status, tgData2);
      throw new Error(tgData2?.description || `Telegram HTTP ${tgResp2.status}`);
    }

    console.log('PDF файл без фото отправлен в Telegram');
    
    // Отправляем уведомления продавцам, чьи товары были заказаны
    await sendNotificationsToSellers(name, phone, address, cartItems, total, time);
    
  } catch (error) {
    console.error('Ошибка отправки PDF без фото:', error);
  }
}

// Алиас для обратной совместимости (старое название)
const sendOrderAsExcel = sendOrderAsPrintPDF;

// Функция отправки заказа как Excel файл в Telegram
async function sendOrderAsExcelFile(name, phone, address, driverName, driverPhone, cartItems, total, time) {
  try {
    console.log('=== Начало создания Excel файла ===');
    
    // Используем XLSX (SheetJS)
    const wb = XLSX.utils.book_new();
    
    // Создаем данные для таблицы
    const data = [
      ['НОВЫЙ ЗАКАЗ'],
      [],
      ['Дата/Время:', time],
      ['Имя клиента:', name],
      ['Телефон:', phone],
      ['Адрес:', address]
    ];
    
    // Добавляем информацию о водителе, если она есть
    if (driverName || driverPhone) {
      data.push(['Водитель:', driverName || '-']);
      data.push(['Тел. водителя:', driverPhone || '-']);
    }
    
    data.push([]);
    data.push(['Название товара', 'Кол-во коробок', 'Ед. в коробке', 'Всего', 'Цена', 'Сумма']);
    
    // Добавляем товары
    cartItems.forEach(item => {
      const product = products.find(p => p.id === item.id);
      const isPack = item.isPack || (product && product.isPack) || false;
      const unitLabel = isPack ? 'пач' : 'шт';
      const unitsPerBox = item.unitsPerBox || (product && product.unitsPerBox) || 72;
      
      // Рассчитываем количество коробок
      const boxCount = Math.floor(item.qty / unitsPerBox);
      const remainingUnits = item.qty % unitsPerBox;
      
      // Формируем строку количества коробок
      let boxText = '';
      if (boxCount > 0 && remainingUnits === 0) {
        boxText = `${boxCount} кор`;
      } else if (boxCount > 0 && remainingUnits > 0) {
        boxText = `${boxCount} кор + ${remainingUnits} ${unitLabel}`;
      } else {
        boxText = `${item.qty} ${unitLabel}`;
      }
      
      // Цена за штуку (если известна)
      const pricePerUnit = (product && product.packQty) 
        ? Math.round((item.price / product.packQty) * 100) / 100 
        : item.price;
      
      // Название с вариантом
      const titleWithVariant = item.variantName ? `${item.title} [${item.variantName}]` : item.title;
      
      data.push([
        titleWithVariant,
        boxText,
        `${unitsPerBox} ${unitLabel}`,
        `${item.qty} ${unitLabel}`,
        `${pricePerUnit} сом`,
        `${item.qty * item.price} сом`
      ]);
    });
    
    // Добавляем итого
    data.push([]);
    data.push(['ИТОГО:', '', '', '', '', `${total} сом`]);
    
    // Создаем worksheet из данных
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Устанавливаем ширину колонок
    ws['!cols'] = [
      { wch: 30 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 }
    ];
    
    // Добавляем worksheet в workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Заказ');
    
    // Генерируем файл
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    console.log('Excel файл сгенерирован, размер:', blob.size, 'байт');
    
    // Отправляем в Telegram через FormData
    const formData = new FormData();
    formData.append('chat_id', '5567924440');
    formData.append('document', blob, `Заказ_${name}_${Date.now()}.xlsx`);
    formData.append('caption', `📊 Excel заказ от ${name}`);

    const tgResp1 = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData
    });

    const tgData1 = await tgResp1.json().catch(() => null);
    if (!tgResp1.ok || tgData1?.ok === false) {
      console.error('Telegram sendDocument error (chat 5567924440):', tgResp1.status, tgData1);
      throw new Error(tgData1?.description || `Telegram HTTP ${tgResp1.status}`);
    }

    // Отправляем второму пользователю
    const formData2 = new FormData();
    formData2.append('chat_id', '246421345');
    formData2.append('document', blob, `Заказ_${name}_${Date.now()}.xlsx`);
    formData2.append('caption', `📊 Excel заказ от ${name}`);

    const tgResp2 = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData2
    });

    const tgData2 = await tgResp2.json().catch(() => null);
    if (!tgResp2.ok || tgData2?.ok === false) {
      console.error('Telegram sendDocument error (chat 246421345):', tgResp2.status, tgData2);
      throw new Error(tgData2?.description || `Telegram HTTP ${tgResp2.status}`);
    }

    console.log('Excel файл отправлен в Telegram');
    
  } catch (error) {
    console.error('Ошибка отправки Excel:', error);
  }
}

// Функция отправки уведомлений продавцам о заказах их товаров
async function sendNotificationsToSellers(customerName, customerPhone, customerAddress, cartItems, total, time) {
  try {
    // Собираем уникальные sellerId из товаров в заказе
    const sellerIds = [...new Set(cartItems.filter(item => item.sellerId).map(item => item.sellerId))];
    
    if (sellerIds.length === 0) {
      console.log('В заказе нет товаров от продавцов');
      return;
    }
    
    console.log('Продавцы в заказе:', sellerIds);
    
    // Получаем данные продавцов из Firebase
    const sellersSnapshot = await db.collection('sellers').get();
    const sellersMap = {};
    sellersSnapshot.forEach(doc => {
      sellersMap[doc.id] = { id: doc.id, ...doc.data() };
    });
    
    // Для каждого продавца формируем и отправляем уведомление
    for (const sellerId of sellerIds) {
      const seller = sellersMap[sellerId];
      
      if (!seller) {
        console.log(`Продавец ${sellerId} не найден`);
        continue;
      }
      
      if (!seller.telegramId) {
        console.log(`У продавца ${seller.name} не указан Telegram ID`);
        continue;
      }
      
      // Фильтруем товары только этого продавца
      const sellerItems = cartItems.filter(item => item.sellerId === sellerId);
      const sellerTotal = sellerItems.reduce((sum, item) => sum + (item.qty * item.price), 0);
      
      // Формируем сообщение с расчётом коробок
      const itemsList = sellerItems.map(item => {
        const product = products.find(p => p.id === item.id);
        const isPack = item.isPack || (product && product.isPack) || false;
        const unitLabel = isPack ? 'пачка' : 'шт';
        const packQty = item.packQty || (product && product.packQty) || null;
        const packInfo = (isPack && packQty) ? ` (~${packQty} шт/пачка)` : '';
        const variantInfo = item.variantName ? ` [${item.variantName}]` : '';
        
        // Расчёт коробок
        const unitsPerBox = item.unitsPerBox || (product && product.unitsPerBox) || 72;
        const boxCount = Math.floor(item.qty / unitsPerBox);
        const remainingUnits = item.qty % unitsPerBox;
        let qtyText = '';
        if (boxCount > 0 && remainingUnits === 0) {
          qtyText = `${boxCount} кор (${unitsPerBox} ${unitLabel})`;
        } else if (boxCount > 0 && remainingUnits > 0) {
          qtyText = `${boxCount} кор + ${remainingUnits} ${unitLabel}`;
        } else {
          qtyText = `${item.qty} ${unitLabel}`;
        }
        
        return `📦 ${item.title}${variantInfo}${packInfo}\n   ${qtyText} × ${item.price} сом = ${item.qty * item.price} сом`;
      }).join('\n\n');
      
      const message = `🛒 *НОВЫЙ ЗАКАЗ ВАШИХ ТОВАРОВ!*\n\n` +
        `📅 *Дата:* ${time}\n` +
        `👤 *Клиент:* ${customerName}\n` +
        `📱 *Телефон:* ${customerPhone}\n` +
        `📍 *Адрес:* ${customerAddress}\n\n` +
        `*Ваши товары в заказе:*\n\n${itemsList}\n\n` +
        `💰 *Сумма за ваши товары:* ${sellerTotal} сом\n` +
        `📊 *Общая сумма заказа:* ${total} сом`;
      
      // Отправляем в Telegram продавцу
      try {
        const response = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: seller.telegramId,
            text: message,
            parse_mode: 'Markdown'
          })
        });
        
        const data = await response.json();
        if (data.ok) {
          console.log(`Уведомление отправлено продавцу ${seller.name} (ID: ${seller.telegramId})`);
        } else {
          console.error(`Ошибка отправки продавцу ${seller.name}:`, data.description);
        }
      } catch (err) {
        console.error(`Ошибка отправки продавцу ${seller.name}:`, err);
      }
    }
    
  } catch (error) {
    console.error('Ошибка отправки уведомлений продавцам:', error);
  }
}

// Функция отправки РАЗДЕЛЬНОГО уведомления админу с группировкой по продавцам
async function sendSeparatedOrderToAdmin(customerName, customerPhone, customerAddress, driverName, driverPhone, cartItems, total, time) {
  try {
    // Получаем данные продавцов из Firebase
    const sellersSnapshot = await db.collection('sellers').get();
    const sellersMap = {};
    sellersSnapshot.forEach(doc => {
      sellersMap[doc.id] = { id: doc.id, ...doc.data() };
    });
    
    // Разделяем товары: наши (без sellerId) и товары продавцов
    const ourItems = cartItems.filter(item => !item.sellerId);
    const sellerItems = cartItems.filter(item => item.sellerId);
    
    // Группируем товары продавцов по sellerId
    const itemsBySeller = {};
    for (const item of sellerItems) {
      if (!itemsBySeller[item.sellerId]) {
        itemsBySeller[item.sellerId] = [];
      }
      itemsBySeller[item.sellerId].push(item);
    }
    
    // Формируем сообщение с разделением
    let message = `🛒 *НОВЫЙ ЗАКАЗ - РАЗБИВКА ПО ПРОДАВЦАМ*\n\n`;
    message += `📅 *Дата:* ${time}\n`;
    message += `👤 *Клиент:* ${customerName}\n`;
    message += `📱 *Телефон:* ${customerPhone}\n`;
    message += `📍 *Адрес:* ${customerAddress}\n`;
    
    if (driverName || driverPhone) {
      message += `🚗 *Водитель:* ${driverName || '-'}\n`;
      message += `📞 *Тел. водителя:* ${driverPhone || '-'}\n`;
    }
    
    message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    // НАШИ товары (без продавца)
    if (ourItems.length > 0) {
      const ourTotal = ourItems.reduce((sum, item) => sum + (item.qty * item.price), 0);
      message += `\n🏪 *НАШИ ТОВАРЫ:*\n\n`;
      
      for (const item of ourItems) {
        const product = products.find(p => p.id === item.id);
        const isPack = item.isPack || (product && product.isPack) || false;
        const unitLabel = isPack ? 'пачка' : 'шт';
        const packQty = item.packQty || (product && product.packQty) || null;
        const packInfo = (isPack && packQty) ? ` (~${packQty} шт/пачка)` : '';
        const variantInfo = item.variantName ? ` [${item.variantName}]` : '';
        
        // Расчёт коробок для наших товаров
        const unitsPerBox = item.unitsPerBox || (product && product.unitsPerBox) || 72;
        const boxCount = Math.floor(item.qty / unitsPerBox);
        const remainingUnits = item.qty % unitsPerBox;
        let qtyText;
        if (boxCount > 0 && remainingUnits > 0) {
          qtyText = `${boxCount} кор (${boxCount * unitsPerBox} ${unitLabel}) + ${remainingUnits} ${unitLabel}`;
        } else if (boxCount > 0) {
          qtyText = `${boxCount} кор (${item.qty} ${unitLabel})`;
        } else {
          qtyText = `${item.qty} ${unitLabel}`;
        }
        
        message += `📦 ${item.title}${variantInfo}${packInfo}\n`;
        message += `   ${qtyText} × ${item.price} сом = ${item.qty * item.price} сом\n\n`;
      }
      
      message += `💰 *Сумма наших товаров:* ${ourTotal} сом\n`;
      message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    // Товары каждого продавца
    for (const sellerId in itemsBySeller) {
      const seller = sellersMap[sellerId];
      const items = itemsBySeller[sellerId];
      const sellerTotal = items.reduce((sum, item) => sum + (item.qty * item.price), 0);
      
      const sellerName = seller ? seller.name : (items[0]?.sellerName || 'Неизвестный продавец');
      const sellerPhone = seller ? seller.phone : '';
      
      message += `\n🏷️ *ПРОДАВЕЦ: ${sellerName}*\n`;
      if (sellerPhone) {
        message += `📱 Телефон: ${sellerPhone}\n`;
      }
      message += `\n`;
      
      for (const item of items) {
        const product = products.find(p => p.id === item.id);
        const isPack = item.isPack || (product && product.isPack) || false;
        const unitLabel = isPack ? 'пачка' : 'шт';
        const packQty = item.packQty || (product && product.packQty) || null;
        const packInfo = (isPack && packQty) ? ` (~${packQty} шт/пачка)` : '';
        const variantInfo = item.variantName ? ` [${item.variantName}]` : '';
        
        // Расчёт коробок для товаров продавцов
        const unitsPerBox = item.unitsPerBox || (product && product.unitsPerBox) || 72;
        const boxCount = Math.floor(item.qty / unitsPerBox);
        const remainingUnits = item.qty % unitsPerBox;
        let qtyText;
        if (boxCount > 0 && remainingUnits > 0) {
          qtyText = `${boxCount} кор (${boxCount * unitsPerBox} ${unitLabel}) + ${remainingUnits} ${unitLabel}`;
        } else if (boxCount > 0) {
          qtyText = `${boxCount} кор (${item.qty} ${unitLabel})`;
        } else {
          qtyText = `${item.qty} ${unitLabel}`;
        }
        
        message += `📦 ${item.title}${variantInfo}${packInfo}\n`;
        message += `   ${qtyText} × ${item.price} сом = ${item.qty * item.price} сом\n\n`;
      }
      
      message += `💰 *Сумма продавца:* ${sellerTotal} сом\n`;
      message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    message += `\n💵 *ОБЩАЯ СУММА ЗАКАЗА:* ${total} сом`;
    
    // Отправляем админу
    await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '5567924440',
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    // Отправляем второму админу
    await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '246421345',
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    console.log('Раздельное уведомление отправлено админам');
    
  } catch (error) {
    console.error('Ошибка отправки раздельного уведомления:', error);
  }
}

// ==================== ИСТОРИЯ ЗАКАЗОВ (ЛИЧНЫЙ КАБИНЕТ) ====================

// Сохранить заказ в историю
function saveOrderToHistory(order) {
  try {
    const storedData = localStorage.getItem('orderHistory');
    let ordersList = [];
    
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        if (Array.isArray(parsed)) {
          ordersList = parsed;
        }
      } catch (parseErr) {
        ordersList = [];
      }
    }
    
    // Добавляем ID заказа
    order.id = 'ORD-' + Date.now();
    
    // Добавляем в начало массива (новые сверху)
    ordersList.unshift(order);
    
    // Ограничиваем историю 50 заказами
    if (ordersList.length > 50) {
      ordersList = ordersList.slice(0, 50);
    }
    
    localStorage.setItem('orderHistory', JSON.stringify(ordersList));
    console.log('Заказ сохранён в историю:', order.id);
  } catch (e) {
    console.error('Ошибка сохранения заказа в историю:', e);
  }
}

// Получить историю заказов
function getOrderHistory() {
  try {
    const data = localStorage.getItem('orderHistory');
    if (!data) return [];
    const parsed = JSON.parse(data);
    // Убеждаемся что это массив
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (e) {
    console.error('Ошибка чтения истории заказов:', e);
    return [];
  }
}

// Открыть окно истории заказов
function openOrderHistory() {
  const ordersList = getOrderHistory();
  console.log('История заказов:', ordersList);
  
  let html = `
    <div style="max-height:70vh; overflow-y:auto; background:#f5f5f5; padding:15px; border-radius:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3 style="margin:0; color:#333;">📋 История заказов</h3>
        ${ordersList.length > 0 ? `<button onclick="clearOrderHistory()" style="padding:6px 12px; background:#dc3545; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">🗑️ Очистить</button>` : ''}
      </div>
  `;
  
  if (ordersList.length === 0) {
    html += `
      <div style="text-align:center; padding:40px 20px; color:#666; background:white; border-radius:10px;">
        <div style="font-size:48px; margin-bottom:15px;">📦</div>
        <div style="font-size:16px; font-weight:600; margin-bottom:8px;">Заказов пока нет</div>
        <div style="">Ваши заказы будут отображаться здесь после оформления</div>
      </div>
    `;
  } else {
      ordersList.forEach((order, index) => {
        const date = new Date(order.timestamp);
        const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        // Статус с цветом
        const statusColors = {
          'Новый': '#007bff',
          'В обработке': '#ffc107',
          'Доставляется': '#17a2b8',
          'Выполнен': '#28a745',
          'Отменён': '#dc3545'
        };
        const statusColor = statusColors[order.status] || '#666';
        
        // Количество товаров
        const itemsCount = (order.items || []).reduce((sum, item) => sum + (item.qty || 1), 0);
        
        html += `
          <div style="background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:15px; margin-bottom:12px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
              <div>
                <div style="font-weight:600; color:#333; ">${order.id || `Заказ #${index + 1}`}</div>
                <div style="font-size:12px; color:#888;">${dateStr}, ${timeStr}</div>
              </div>
              <span style="background:${statusColor}; color:white; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:600;">${order.status || 'Новый'}</span>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px dashed #e0e0e0; border-bottom:1px dashed #e0e0e0; margin:10px 0;">
            <div style="font-size:13px; color:#666;">
              📦 ${itemsCount} товар(ов)
            </div>
            <div style="font-weight:700; color:#e53935; font-size:16px;">${order.total || 0} сом</div>
          </div>
          
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button onclick="viewOrderDetails(${index})" style="flex:1; padding:8px; background:#007bff; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">👁️ Подробнее</button>
            <button onclick="repeatOrder(${index})" style="flex:1; padding:8px; background:#28a745; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">🔄 Повторить</button>
          </div>
        </div>
      `;
    });
  }
  
  html += '</div>';
  
  Swal.fire({
    title: '📋 Мои заказы',
    html: html,
    showConfirmButton: true,
    confirmButtonText: 'Закрыть',
    confirmButtonColor: '#007bff',
    width: '95%',
    background: '#fff'
  });
}

// Просмотр деталей заказа
function viewOrderDetails(index) {
  const ordersList = getOrderHistory();
  const order = ordersList[index];
  
  if (!order) {
    Swal.fire('Ошибка', 'Заказ не найден', 'error');
    return;
  }
  
  const date = new Date(order.timestamp);
  const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  
  let itemsHtml = '';
  (order.items || []).forEach(item => {
    const itemTotal = (item.price || 0) * (item.qty || 1);
    const variantHtml = item.variantName ? `<div style="font-size:11px; color:#7b1fa2; background:#f3e5f5; padding:2px 6px; border-radius:4px; display:inline-block; margin-top:2px;">🎨 ${item.variantName}</div>` : '';
    itemsHtml += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0;">
        <div style="flex:1;">
          <div style="font-weight:500; font-size:13px;">${item.title || 'Товар'}</div>
          ${variantHtml}
          <div style="font-size:12px; color:#888;">${item.qty || 1} × ${item.price || 0} сом</div>
        </div>
        <div style="font-weight:600; color:#333;">${itemTotal} сом</div>
      </div>
    `;
  });
  
  const driverInfo = (order.driverName || order.driverPhone) ? `
    <div style="margin-top:10px; padding-top:10px; border-top:1px solid #e0e0e0;">
      <div style="font-size:13px; color:#666;">🚗 Водитель: ${order.driverName || '-'}</div>
      <div style="font-size:13px; color:#666;">📞 Тел. водителя: ${order.driverPhone || '-'}</div>
    </div>
  ` : '';
  
  const html = `
    <div style="text-align:left;">
      <div style="background:#f8f9fa; padding:12px; border-radius:8px; margin-bottom:15px;">
        <div style="font-size:13px; color:#666;">📅 ${dateStr}, ${timeStr}</div>
        <div style="font-size:13px; color:#666; margin-top:4px;">👤 ${order.name || '-'}</div>
        <div style="font-size:13px; color:#666;">📞 ${order.phone || '-'}</div>
        <div style="font-size:13px; color:#666;">📍 ${order.address || '-'}</div>
        ${driverInfo}
      </div>
      
      <div style="font-weight:600; margin-bottom:8px;">🛒 Товары:</div>
      <div style="max-height:200px; overflow-y:auto; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:10px;">
        ${itemsHtml || '<div style="color:#888;">Нет товаров</div>'}
      </div>
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; padding:12px; background:#fff3e0; border-radius:8px;">
        <span style="font-weight:600;">Итого:</span>
        <span style="font-weight:700; font-size:18px; color:#e53935;">${order.total || 0} сом</span>
      </div>
    </div>
  `;
  
  Swal.fire({
    title: order.id || 'Детали заказа',
    html: html,
    showCancelButton: true,
    confirmButtonText: '🔄 Повторить заказ',
    cancelButtonText: 'Закрыть',
    width: '90%'
  }).then(result => {
    if (result.isConfirmed) {
      repeatOrder(index);
    }
  });
}

// Повторить заказ (добавить товары в корзину)
function repeatOrder(index) {
  const ordersList = getOrderHistory();
  const order = ordersList[index];
  
  if (!order || !order.items || order.items.length === 0) {
    Swal.fire('Ошибка', 'Не удалось повторить заказ', 'error');
    return;
  }
  
  let addedCount = 0;
  let notFoundItems = [];
  
  order.items.forEach(item => {
    // Проверяем, существует ли товар в базе
    const product = products.find(p => p.id === item.id);
    
    if (product && !product.blocked) {
      // Проверяем наличие
      const stock = typeof product.stock === 'number' ? product.stock : Infinity;
      if (stock > 0) {
        // Добавляем в корзину
        const existingItem = cart.find(c => c.id === item.id);
        if (existingItem) {
          existingItem.qty = Math.min((existingItem.qty || 0) + (item.qty || 1), stock);
        } else {
          cart.push({
            id: product.id,
            title: product.title,
            price: product.price,
            qty: Math.min(item.qty || 1, stock),
            image: product.image
          });
        }
        addedCount++;
      } else {
        notFoundItems.push(item.title || 'Товар');
      }
    } else {
      notFoundItems.push(item.title || 'Товар');
    }
  });
  
  updateCart();
  // saveCart определена в cart.html, вызываем только если доступна
  if (typeof saveCart === 'function') {
    saveCart();
  } else {
    // Фоллбэк: сохраняем корзину в localStorage напрямую
    try { localStorage.setItem('cart', JSON.stringify(cart)); } catch(e) {}
  }
  
  if (addedCount > 0 && notFoundItems.length === 0) {
    Swal.fire('Готово!', `Все ${addedCount} товар(ов) добавлены в корзину`, 'success');
  } else if (addedCount > 0 && notFoundItems.length > 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Частично добавлено',
      html: `Добавлено: ${addedCount} товар(ов)<br><br>Недоступны:<br>${notFoundItems.join('<br>')}`,
      confirmButtonText: 'Понятно'
    });
  } else {
    Swal.fire('Ошибка', 'Ни один товар из этого заказа сейчас недоступен', 'error');
  }
}

// Очистить историю заказов
function clearOrderHistory() {
  Swal.fire({
    title: 'Очистить историю?',
    text: 'Все заказы будут удалены из истории',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Да, очистить',
    confirmButtonColor: '#dc3545',
    cancelButtonText: 'Отмена'
  }).then(result => {
    if (result.isConfirmed) {
      localStorage.removeItem('orderHistory');
      Swal.fire('Готово', 'История заказов очищена', 'success');
    }
  });
}

