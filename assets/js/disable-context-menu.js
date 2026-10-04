// Vô hiệu hoá chuột phải (context menu) trên toàn bộ trang
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});