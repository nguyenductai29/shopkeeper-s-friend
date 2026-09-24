# ShopFlow và GenBarcodeProduct

`GenBarcodeProduct/server` là API dùng chung kết nối PostgreSQL. Web nhập sản phẩm gọi API này. ShopFlow chạy Electron + Express tại shop; Express chuyển tiếp tới cùng API qua `SHOP_KOME_API_URL`. Không đặt `DATABASE_URL` vào frontend hoặc Electron.

## Các bản sửa cần phát hành cùng nhau

- GenBarcodeProduct: đăng ký settings, payment QR, invoice template và order-item routes; sửa SQL dashboard; hỗ trợ tạo đơn kèm dòng hàng trong một transaction; ghi nhận thu tiền và điều chỉnh phiếu nhập có kiểm tra tồn kho.
- ShopFlow: dùng giao dịch tạo đơn mới, bỏ lần cộng/trừ kho dư; đọc UUID và số PostgreSQL đúng kiểu; giữ mã vạch khác mã sản phẩm; xử lý lỗi API; bố cục cố định theo cửa sổ, cuộn trong bảng hoặc vùng nội dung.
- POS quy đổi giá JPY sang VND theo `jpy_to_vnd_rate`. Đơn và các dòng hàng lưu số tiền lúc bán. Giá gốc sản phẩm vẫn giữ nguyên. Phiếu nhập giữ đơn vị của sản phẩm; hàng mới nhập tay tại shop dùng VND. Các màn tài chính và báo cáo chọn riêng VND/JPY, không cộng lẫn tiền tệ.
- Tổng chi tiền bao gồm thanh toán nhập hàng; lợi nhuận trừ giá vốn và chi phí hoạt động, không trừ tiền thanh toán nhập hàng thêm lần nữa.

## Kiểm tra tại máy phát triển

Trong repo ShopFlow:

```powershell
npm install
npm test
npm run typecheck
npm run build
```

Trong `GenBarcodeProduct/server`:

```powershell
npm install
npm test
```

Các integration test dùng PostgreSQL PGlite trong bộ nhớ, chạy migration vào database riêng; không dùng `DATABASE_URL` thật và không gửi thông báo. Test giao diện dùng API giả lập. Kết quả này không thay thế kiểm tra phiên bản đang chạy trên server.

## Thứ tự cập nhật

1. Đưa các thay đổi `GenBarcodeProduct/server` lên server API theo quy trình phát hành hiện có. Với compose của repo, rebuild và restart service `api`. Không chỉ restart container từ image cũ.
2. Kiểm tra `/api/health`, `/api/settings/shopflow`, `/api/payment-qrs`, `/api/invoice-templates`, `/api/order-items` và `/api/dashboard?period=today&currency=VND` trả JSON thành công.
3. Khởi động lại `npm run dev` hoặc phát hành lại bản Electron của ShopFlow. Kiểm tra tỷ giá tại Cài đặt trước khi bán sản phẩm JPY.

Các route mới dùng bảng/cột đã có trong migration 001–004. Không có migration mới trong bản sửa này; không chạy migration trên database đang hoạt động chỉ để xử lý lỗi thiếu route. Database cài mới vẫn cần migration theo README của shared API.

Việc sửa source tại máy không tự cập nhật API đang chạy tại `shop.imokome-cloud.com`. Chưa có dữ liệu hay bản phát hành production nào được thay đổi trong quá trình kiểm thử này.
