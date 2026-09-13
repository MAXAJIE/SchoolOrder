import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "zh" | "ms";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ms", label: "Bahasa Melayu" },
];

/**
 * Single flat dictionary. Every user-visible string lives here so all three
 * languages stay in sync for every role (buyer, dealer, owner).
 */
const dict = {
  "app.name": { en: "SchoolOrder", zh: "SchoolOrder", ms: "SchoolOrder" },
  "app.tagline": {
    en: "Order drinks, pay, and pick up with your code.",
    zh: "在线下单、付款，用取货码取饮料。",
    ms: "Pesan minuman, bayar dan ambil dengan kod anda.",
  },
  "landing.heroTitle": {
    en: "Your school shop, one tap away.",
    zh: "你的学校商店，一键搞定。",
    ms: "Kedai sekolah anda, satu ketik sahaja.",
  },
  "landing.heroBody": {
    en: "Buyers order without an account and get a pickup code. Owners run products, stock, payments and orders in one place.",
    zh: "买家无需注册即可下单并获得取货码。店主可在一处管理产品、库存、付款与订单。",
    ms: "Pembeli memesan tanpa akaun dan menerima kod ambilan. Pemilik menguruskan produk, stok, bayaran dan pesanan di satu tempat.",
  },
  "landing.guestCta": { en: "Order now", zh: "立即下单", ms: "Pesan sekarang" },
  "landing.ownerCta": { en: "Owner console", zh: "店主后台", ms: "Konsol pemilik" },
  "landing.guestTitle": { en: "For buyers", zh: "买家专区", ms: "Untuk pembeli" },
  "landing.guestBody": {
    en: "Tap a product, choose your options, pay by cash or DuitNow QR, then show your pickup code.",
    zh: "点选产品、选择配料、用现金或 DuitNow QR 付款，然后出示取货码。",
    ms: "Ketik produk, pilih pilihan anda, bayar tunai atau DuitNow QR, kemudian tunjukkan kod ambilan.",
  },
  "landing.ownerTitle": { en: "For the shop owner", zh: "店主专区", ms: "Untuk pemilik kedai" },
  "landing.ownerBody": {
    en: "Sign in to manage products and options, track stock, confirm payments and review order history.",
    zh: "登录后可管理产品与选项、追踪库存、确认付款并查看订单历史。",
    ms: "Log masuk untuk mengurus produk dan pilihan, menjejak stok, mengesahkan bayaran dan melihat sejarah pesanan.",
  },
  "landing.f1Title": { en: "Pay your way", zh: "多种付款", ms: "Bayar ikut cara anda" },
  "landing.f1Body": {
    en: "Cash at the counter or DuitNow QR with the receipt attached at checkout.",
    zh: "柜台现金，或在结账时用 DuitNow QR 并上传收据。",
    ms: "Tunai di kaunter atau DuitNow QR dengan resit dilampirkan semasa pembayaran.",
  },
  "landing.f2Title": {
    en: "No queue, no account",
    zh: "免排队免注册",
    ms: "Tiada giliran, tiada akaun",
  },
  "landing.f2Body": {
    en: "Order in seconds and keep the link to check your status any time.",
    zh: "几秒下单，保存链接随时查看状态。",
    ms: "Pesan dalam beberapa saat dan simpan pautan untuk menyemak status bila-bila masa.",
  },
  "landing.f3Title": { en: "Stock stays honest", zh: "库存准确", ms: "Stok sentiasa tepat" },
  "landing.f3Body": {
    en: "Stock moves with every order, and cancelled orders never count as sales.",
    zh: "每笔订单都会更新库存，已取消的订单不会计入销售。",
    ms: "Stok berubah dengan setiap pesanan, dan pesanan dibatalkan tidak dikira sebagai jualan.",
  },
  "guest.customise": { en: "Customise", zh: "自定义", ms: "Sesuaikan" },
  "guest.required": { en: "Choose one", zh: "必选一项", ms: "Pilih satu" },
  "guest.upTo": { en: "Choose up to {n}", zh: "最多选 {n} 项", ms: "Pilih sehingga {n}" },
  "image.fitNote": {
    en: "The picture is saved exactly as shown here, so nothing is cut off or stretched.",
    zh: "图片将按此处显示保存，不会被裁切或拉伸。",
    ms: "Gambar disimpan tepat seperti yang dipaparkan, tiada bahagian terpotong atau meleret.",
  },
  "ord.active": { en: "Active", zh: "进行中", ms: "Aktif" },
  "ord.history": { en: "Order history", zh: "订单历史", ms: "Sejarah pesanan" },
  "ord.historyEmpty": {
    en: "No finished orders yet.",
    zh: "还没有已完成的订单。",
    ms: "Tiada pesanan selesai lagi.",
  },
  "ord.backToActive": { en: "Back to active", zh: "返回进行中", ms: "Kembali ke aktif" },
  "ord.cancelledNote": {
    en: "Cancelled — not counted in sales or reports.",
    zh: "已取消——不计入销售与报表。",
    ms: "Dibatalkan — tidak dikira dalam jualan atau laporan.",
  },
  "order.payAtCounter": {
    en: "Show this screen when you pay.",
    zh: "付款时请出示此页面。",
    ms: "Tunjukkan skrin ini semasa membayar.",
  },
  "prod.basePrice": { en: "Base price", zh: "基础价格", ms: "Harga asas" },
  "prod.image": { en: "Product photo", zh: "产品图片", ms: "Foto produk" },
  "prod.options": { en: "Options", zh: "选项", ms: "Pilihan" },
  "prod.optionsHint": {
    en: "Add option groups such as Size or Sugar level. Each choice can add to the price.",
    zh: "添加选项组，例如份量或糖度。每个选择都可加价。",
    ms: "Tambah kumpulan pilihan seperti Saiz atau Paras gula. Setiap pilihan boleh menambah harga.",
  },
  "prod.addOption": { en: "Add option group", zh: "添加选项组", ms: "Tambah kumpulan pilihan" },
  "prod.optionName": { en: "Option name", zh: "选项名称", ms: "Nama pilihan" },
  "prod.addChoice": { en: "Add choice", zh: "添加选择", ms: "Tambah pilihan" },
  "prod.choice": { en: "Choice", zh: "选择", ms: "Pilihan" },
  "prod.priceDelta": { en: "Extra price", zh: "加价", ms: "Harga tambahan" },
  "prod.maxSelect": { en: "Max choices", zh: "最多可选", ms: "Pilihan maksimum" },
  "prod.required": { en: "Required", zh: "必选", ms: "Wajib" },
  "prod.needPrice": {
    en: "Enter a base price.",
    zh: "请输入基础价格。",
    ms: "Masukkan harga asas.",
  },
  "nav.shop": { en: "Shop", zh: "商店", ms: "Kedai" },
  "nav.signin": { en: "Sign in", zh: "登录", ms: "Log masuk" },
  "nav.signout": { en: "Sign out", zh: "登出", ms: "Log keluar" },
  "nav.console": { en: "Console", zh: "管理台", ms: "Konsol" },
  "nav.dashboard": { en: "Dashboard", zh: "总览", ms: "Papan Pemuka" },
  "nav.products": { en: "Products", zh: "产品", ms: "Produk" },
  "nav.orders": { en: "Orders", zh: "订单", ms: "Pesanan" },
  "nav.promos": { en: "Promo codes", zh: "优惠码", ms: "Kod Promosi" },
  "nav.dealers": { en: "Dealers", zh: "经销商", ms: "Pengedar" },
  "nav.requests": { en: "My requests", zh: "我的请求", ms: "Permintaan Saya" },
  "nav.settings": { en: "Settings", zh: "设置", ms: "Tetapan" },
  "nav.appearance": { en: "Appearance", zh: "外观", ms: "Penampilan" },
  "common.language": { en: "Language", zh: "语言", ms: "Bahasa" },
  "common.theme": { en: "Theme", zh: "主题", ms: "Tema" },
  "common.light": { en: "Light", zh: "浅色", ms: "Cerah" },
  "common.dark": { en: "Dark", zh: "深色", ms: "Gelap" },
  "common.system": { en: "System", zh: "跟随系统", ms: "Sistem" },
  "common.loading": { en: "Loading…", zh: "加载中…", ms: "Memuatkan…" },
  "common.retry": { en: "Retry", zh: "重试", ms: "Cuba lagi" },
  "common.save": { en: "Save", zh: "保存", ms: "Simpan" },
  "common.cancel": { en: "Cancel", zh: "取消", ms: "Batal" },
  "common.delete": { en: "Delete", zh: "删除", ms: "Padam" },
  "common.edit": { en: "Edit", zh: "编辑", ms: "Sunting" },
  "common.add": { en: "Add", zh: "添加", ms: "Tambah" },
  "common.close": { en: "Close", zh: "关闭", ms: "Tutup" },
  "common.remove": { en: "Remove", zh: "移除", ms: "Buang" },
  "common.search": { en: "Search", zh: "搜索", ms: "Cari" },
  "common.none": { en: "None", zh: "无", ms: "Tiada" },
  "common.error": {
    en: "Something went wrong.",
    zh: "出错了。",
    ms: "Sesuatu tidak kena.",
  },
  "common.required": { en: "Required", zh: "必填", ms: "Wajib" },
  "common.active": { en: "Active", zh: "启用", ms: "Aktif" },
  "common.inactive": { en: "Inactive", zh: "停用", ms: "Tidak aktif" },
  "common.total": { en: "Total", zh: "合计", ms: "Jumlah" },
  "common.subtotal": { en: "Subtotal", zh: "小计", ms: "Subjumlah" },
  "common.discount": { en: "Discount", zh: "折扣", ms: "Diskaun" },
  "common.quantity": { en: "Quantity", zh: "数量", ms: "Kuantiti" },
  "common.price": { en: "Price", zh: "价格", ms: "Harga" },
  "common.stock": { en: "Stock", zh: "库存", ms: "Stok" },
  "common.status": { en: "Status", zh: "状态", ms: "Status" },
  "common.name": { en: "Name", zh: "名称", ms: "Nama" },
  "common.print": { en: "Print / Save PDF", zh: "打印 / 保存 PDF", ms: "Cetak / Simpan PDF" },
  "common.copy": { en: "Copy link", zh: "复制链接", ms: "Salin pautan" },
  "common.copied": { en: "Copied", zh: "已复制", ms: "Disalin" },
  "common.back": { en: "Back", zh: "返回", ms: "Kembali" },
  "image.crop": { en: "Crop image", zh: "裁剪图片", ms: "Pangkas imej" },
  "image.zoom": { en: "Zoom", zh: "缩放", ms: "Zum" },
  "image.horizontal": { en: "Horizontal position", zh: "水平位置", ms: "Kedudukan mendatar" },
  "image.vertical": { en: "Vertical position", zh: "垂直位置", ms: "Kedudukan menegak" },
  "image.useCrop": {
    en: "Use cropped image",
    zh: "使用裁剪后的图片",
    ms: "Guna imej yang dipangkas",
  },

  "shop.closed": {
    en: "The shop is closed right now.",
    zh: "商店目前已关闭。",
    ms: "Kedai ditutup buat masa ini.",
  },
  "shop.empty": {
    en: "No products on sale yet.",
    zh: "暂时没有在售产品。",
    ms: "Tiada produk dijual lagi.",
  },
  "shop.searchPlaceholder": {
    en: "Search drinks…",
    zh: "搜索饮料…",
    ms: "Cari minuman…",
  },
  "shop.soldOut": { en: "Sold out", zh: "已售罄", ms: "Habis dijual" },
  "shop.left": { en: "left", zh: "剩余", ms: "baki" },
  "shop.add": { en: "Add", zh: "加入", ms: "Tambah" },
  "shop.cart": { en: "Your order", zh: "你的订单", ms: "Pesanan anda" },
  "shop.cartEmpty": { en: "Cart is empty.", zh: "购物车是空的。", ms: "Troli kosong." },
  "shop.checkout": { en: "Checkout", zh: "结账", ms: "Bayar" },
  "shop.yourDetails": { en: "Your details", zh: "你的信息", ms: "Maklumat anda" },
  "shop.buyerName": { en: "Full name", zh: "姓名", ms: "Nama penuh" },
  "shop.buyerAge": { en: "Age", zh: "年龄", ms: "Umur" },
  "shop.buyerClass": { en: "Class", zh: "班级", ms: "Kelas" },
  "shop.payment": { en: "Payment method", zh: "付款方式", ms: "Kaedah pembayaran" },
  "shop.cash": { en: "Cash (COD)", zh: "现金（取货付款）", ms: "Tunai (COD)" },
  "shop.duitnow": { en: "DuitNow QR", zh: "DuitNow QR", ms: "DuitNow QR" },
  "shop.cashNote": {
    en: "You need to pay it COD when getting the stuff. Please note: always bring small change.",
    zh: "取货时以现金付款。请注意：请自备零钱。",
    ms: "Bayar secara tunai semasa mengambil pesanan. Sila bawa duit kecil.",
  },
  "shop.duitnowNote": {
    en: "Please upload the proof of payment to proceed.",
    zh: "请上传付款凭证以继续。",
    ms: "Sila muat naik bukti pembayaran untuk teruskan.",
  },
  "shop.selectPayment": {
    en: "Please choose a payment method.",
    zh: "请选择付款方式。",
    ms: "Sila pilih kaedah pembayaran.",
  },
  "shop.proofRequired": {
    en: "Please attach your DuitNow payment receipt before placing the order.",
    zh: "请先上传 DuitNow 付款凭证，再提交订单。",
    ms: "Sila lampirkan resit pembayaran DuitNow sebelum menghantar pesanan.",
  },
  "shop.imageTooLarge": {
    en: "That image is too large. Please attach an image under 5 MB.",
    zh: "图片太大，请上传小于 5MB 的图片。",
    ms: "Imej terlalu besar. Sila lampirkan imej bawah 5 MB.",
  },
  "shop.stockChanged": {
    en: "Stock just changed while you were ordering. We updated your cart:",
    zh: "下单期间库存已变动，购物车已更新：",
    ms: "Stok berubah semasa anda memesan. Troli anda dikemas kini:",
  },
  "shop.proofHint": {
    en: "Tap to attach a screenshot or photo (image, max 5 MB)",
    zh: "点按上传截图或照片（图片，最大 5MB）",
    ms: "Ketik untuk lampirkan tangkapan skrin atau foto (imej, maks 5 MB)",
  },
  "shop.promo": { en: "Promo code", zh: "优惠码", ms: "Kod promosi" },
  "shop.promoPlaceholder": { en: "Optional", zh: "选填", ms: "Pilihan" },
  "shop.placeOrder": { en: "Place order", zh: "提交订单", ms: "Hantar pesanan" },
  "shop.placing": { en: "Placing order…", zh: "提交中…", ms: "Menghantar…" },
  "shop.stockWarning": {
    en: "First come, first served. Stock is only reserved once your order is submitted.",
    zh: "先到先得。库存在订单提交成功后才会被锁定。",
    ms: "Siapa cepat dia dapat. Stok hanya ditempah selepas pesanan dihantar.",
  },

  "order.title": { en: "Order confirmation", zh: "订单凭证", ms: "Pengesahan pesanan" },
  "order.number": { en: "Order number", zh: "订单号", ms: "Nombor pesanan" },
  "order.pickupCode": { en: "Pickup code", zh: "取货码", ms: "Kod pengambilan" },
  "order.showThis": {
    en: "Show this code when picking up your order.",
    zh: "取货时出示此码。",
    ms: "Tunjukkan kod ini semasa mengambil pesanan.",
  },
  "order.notFound": {
    en: "Order not found. Check your link.",
    zh: "找不到订单，请检查链接。",
    ms: "Pesanan tidak dijumpai. Semak pautan anda.",
  },
  "order.uploadProof": {
    en: "Upload payment proof",
    zh: "上传付款凭证",
    ms: "Muat naik bukti bayaran",
  },
  "order.proofUploaded": {
    en: "Payment proof received. Waiting for verification.",
    zh: "已收到付款凭证，等待核实。",
    ms: "Bukti pembayaran diterima. Menunggu pengesahan.",
  },
  "order.imageOnly": {
    en: "Only image files up to 5 MB are allowed.",
    zh: "只允许 5MB 以内的图片文件。",
    ms: "Hanya fail imej sehingga 5 MB dibenarkan.",
  },
  "order.saveLink": {
    en: "Save this page link — it is the only way back to your order.",
    zh: "请保存此页面链接，这是查看订单的唯一方式。",
    ms: "Simpan pautan halaman ini — ia satu-satunya cara kembali ke pesanan anda.",
  },
  "order.payNow": { en: "Scan to pay", zh: "扫码付款", ms: "Imbas untuk bayar" },
  "order.statusHint.pending": { en: "We received your order and the shop is reviewing it.", zh: "订单已收到，商家正在确认。", ms: "Pesanan diterima dan sedang disemak." },
  "order.statusHint.confirmed": { en: "Your order is confirmed and being prepared.", zh: "订单已确认，正在准备中。", ms: "Pesanan disahkan dan sedang disediakan." },
  "order.statusHint.completed": { en: "This order is complete. Enjoy!", zh: "订单已完成，请享用！", ms: "Pesanan selesai. Selamat menikmati!" },
  "order.statusHint.cancelled": { en: "This order was cancelled. No further action is needed.", zh: "订单已取消，无需继续操作。", ms: "Pesanan dibatalkan. Tiada tindakan lanjut diperlukan." },

  "req.draft": { en: "Draft", zh: "草稿", ms: "Draf" },
  "req.submitted": { en: "Submitted", zh: "已提交", ms: "Dihantar" },
  "req.quoted": { en: "Quoted", zh: "已报价", ms: "Disebut harga" },
  "req.approved": { en: "Approved", zh: "已批准", ms: "Diluluskan" },
  "req.rejected": { en: "Rejected", zh: "已拒绝", ms: "Ditolak" },
  "req.cancelled": { en: "Cancelled", zh: "已取消", ms: "Dibatalkan" },
  "status.pending": { en: "Pending", zh: "待处理", ms: "Menunggu" },
  "status.confirmed": { en: "Confirmed", zh: "已确认", ms: "Disahkan" },
  "status.completed": { en: "Completed", zh: "已完成", ms: "Selesai" },
  "status.cancelled": { en: "Cancelled", zh: "已取消", ms: "Dibatalkan" },
  "pay.pending_payment": { en: "Unpaid", zh: "未付款", ms: "Belum bayar" },
  "pay.proof_uploaded": { en: "Proof uploaded", zh: "已上传凭证", ms: "Bukti dimuat naik" },
  "pay.paid": { en: "Paid", zh: "已付款", ms: "Sudah bayar" },
  "pay.rejected": { en: "Proof rejected", zh: "凭证被拒", ms: "Bukti ditolak" },

  "auth.title": {
    en: "Sign in to SchoolOrder",
    zh: "登录 SchoolOrder",
    ms: "Log masuk SchoolOrder",
  },
  "auth.email": { en: "Email", zh: "邮箱", ms: "E-mel" },
  "auth.password": { en: "Password", zh: "密码", ms: "Kata laluan" },
  "auth.signin": { en: "Sign in", zh: "登录", ms: "Log masuk" },
  "auth.signup": { en: "Create account", zh: "注册", ms: "Daftar akaun" },
  "auth.google": {
    en: "Continue with Google",
    zh: "使用 Google 登录",
    ms: "Teruskan dengan Google",
  },
  "auth.callbackWait": { en: "Signing you in…", zh: "正在登录…", ms: "Sedang log masuk…" },
  "auth.callbackFailed": {
    en: "We could not complete the sign in. Please try again.",
    zh: "无法完成登录，请重试。",
    ms: "Log masuk tidak dapat diselesaikan. Sila cuba lagi.",
  },
  "auth.toggleSignup": {
    en: "No account? Create one",
    zh: "没有账号？去注册",
    ms: "Tiada akaun? Daftar",
  },
  "auth.toggleSignin": {
    en: "Already have an account? Sign in",
    zh: "已有账号？去登录",
    ms: "Sudah ada akaun? Log masuk",
  },
  "auth.showPassword": { en: "Show password", zh: "显示密码", ms: "Tunjuk kata laluan" },
  "auth.checkEmail": {
    en: "Account created. You can sign in now.",
    zh: "账号已创建，现在可以登录。",
    ms: "Akaun dicipta. Anda boleh log masuk sekarang.",
  },
  "auth.timeout": {
    en: "Signed out after 15 minutes of inactivity.",
    zh: "已因 15 分钟无操作自动登出。",
    ms: "Dilog keluar selepas 15 minit tidak aktif.",
  },

  "console.noOrg": {
    en: "You are not part of a shop yet.",
    zh: "你还没有属于任何商店。",
    ms: "Anda belum menyertai mana-mana kedai.",
  },
  "console.createOrg": { en: "Create your shop", zh: "创建商店", ms: "Cipta kedai anda" },
  "console.orgName": { en: "Shop name", zh: "商店名称", ms: "Nama kedai" },
  "console.roleOwner": { en: "Owner", zh: "老板", ms: "Pemilik" },
  "console.roleDealer": { en: "Dealer", zh: "经销商", ms: "Pengedar" },

  "dash.todaySales": { en: "Sales today", zh: "今日销售额", ms: "Jualan hari ini" },
  "dash.todayOrders": { en: "Orders today", zh: "今日订单数", ms: "Pesanan hari ini" },
  "dash.unpaid": { en: "Awaiting payment", zh: "待付款", ms: "Menunggu bayaran" },
  "dash.stock": { en: "Units in stock", zh: "库存总量", ms: "Unit dalam stok" },
  "dash.revenue": { en: "Revenue", zh: "营收", ms: "Hasil" },
  "dash.cost": { en: "Cost", zh: "成本", ms: "Kos" },
  "dash.profit": { en: "Profit", zh: "利润", ms: "Untung" },
  "dash.topProducts": { en: "Top products", zh: "热卖产品", ms: "Produk terlaris" },
  "dash.last7": { en: "Last 7 days", zh: "最近 7 天", ms: "7 hari lepas" },
  "dash.noData": { en: "No data yet.", zh: "暂无数据。", ms: "Tiada data lagi." },

  "prod.new": { en: "New product", zh: "新建产品", ms: "Produk baharu" },
  "prod.variants": { en: "Variants", zh: "规格", ms: "Varian" },
  "prod.variantName": { en: "Variant name", zh: "规格名称", ms: "Nama varian" },
  "prod.cost": { en: "Cost price", zh: "成本价", ms: "Harga kos" },
  "prod.description": { en: "Description", zh: "描述", ms: "Penerangan" },
  "prod.addVariant": { en: "Add variant", zh: "添加规格", ms: "Tambah varian" },
  "prod.empty": { en: "No products yet.", zh: "还没有产品。", ms: "Tiada produk lagi." },
  "prod.adjustStock": { en: "Adjust stock", zh: "调整库存", ms: "Laras stok" },
  "prod.adjustAmount": { en: "Change (+/-)", zh: "变动 (+/-)", ms: "Perubahan (+/-)" },
  "prod.needVariant": {
    en: "Add at least one variant with a price.",
    zh: "至少添加一个带价格的规格。",
    ms: "Tambah sekurang-kurangnya satu varian berharga.",
  },

  "ord.empty": { en: "No orders yet.", zh: "还没有订单。", ms: "Tiada pesanan lagi." },
  "ord.searchPlaceholder": {
    en: "Search order number, name, pickup code…",
    zh: "搜索订单号、姓名、取货码…",
    ms: "Cari nombor pesanan, nama, kod…",
  },
  "ord.markPaid": { en: "Mark paid", zh: "标记已付款", ms: "Tanda dibayar" },
  "ord.rejectProof": { en: "Reject proof", zh: "拒绝凭证", ms: "Tolak bukti" },
  "ord.complete": { en: "Complete", zh: "完成", ms: "Selesai" },
  "ord.cancel": { en: "Cancel order", zh: "取消订单", ms: "Batal pesanan" },
  "ord.cancelConfirm": {
    en: "Cancel this order and return the stock?",
    zh: "取消此订单并返还库存？",
    ms: "Batalkan pesanan ini dan pulangkan stok?",
  },
  "ord.viewProof": { en: "View proof", zh: "查看凭证", ms: "Lihat bukti" },
  "ord.buyer": { en: "Buyer", zh: "买家", ms: "Pembeli" },
  "ord.items": { en: "Items", zh: "商品", ms: "Item" },

  "promo.new": { en: "New promo code", zh: "新建优惠码", ms: "Kod promosi baharu" },
  "promo.code": { en: "Code", zh: "优惠码", ms: "Kod" },
  "promo.type": { en: "Type", zh: "类型", ms: "Jenis" },
  "promo.fixed": { en: "Fixed amount off", zh: "固定金额减免", ms: "Potongan jumlah tetap" },
  "promo.percent": { en: "Percentage off", zh: "百分比折扣", ms: "Diskaun peratus" },
  "promo.second": { en: "2nd item % off", zh: "第二件折扣", ms: "Item ke-2 diskaun %" },
  "promo.value": { en: "Value", zh: "数值", ms: "Nilai" },
  "promo.min": { en: "Minimum order", zh: "最低消费", ms: "Pesanan minimum" },
  "promo.maxDiscount": { en: "Max discount", zh: "最高折扣", ms: "Diskaun maksimum" },
  "promo.limit": { en: "Usage limit", zh: "使用次数上限", ms: "Had penggunaan" },
  "promo.used": { en: "Used", zh: "已使用", ms: "Digunakan" },
  "promo.scope": { en: "Applies to", zh: "适用产品", ms: "Terpakai untuk" },
  "promo.allProducts": { en: "All products", zh: "全部产品", ms: "Semua produk" },
  "promo.empty": { en: "No promo codes yet.", zh: "还没有优惠码。", ms: "Tiada kod promosi." },
  "promo.secondRule": {
    en: "Rule: within one product, every 2nd unit gets the discount.",
    zh: "规则：同一产品内，每 2 件中的第 2 件享受折扣。",
    ms: "Peraturan: dalam satu produk, setiap unit ke-2 mendapat diskaun.",
  },

  "dealer.invite": {
    en: "Add dealer by user ID",
    zh: "通过用户 ID 添加经销商",
    ms: "Tambah pengedar melalui ID",
  },
  "dealer.userId": { en: "Dealer user ID", zh: "经销商用户 ID", ms: "ID pengguna pengedar" },
  "dealer.userIdHint": {
    en: "The dealer signs up first, then copies their user ID from Settings.",
    zh: "经销商先注册，然后在“设置”中复制自己的用户 ID。",
    ms: "Pengedar mendaftar dahulu, kemudian salin ID pengguna dari Tetapan.",
  },
  "dealer.empty": { en: "No dealers yet.", zh: "还没有经销商。", ms: "Tiada pengedar lagi." },
  "dealer.requests": { en: "Requests", zh: "请求", ms: "Permintaan" },
  "dealer.newRequest": { en: "New request", zh: "新建请求", ms: "Permintaan baharu" },
  "dealer.affectsInventory": {
    en: "Deduct from owner stock when approved",
    zh: "批准后从老板库存扣减",
    ms: "Tolak daripada stok pemilik apabila diluluskan",
  },
  "dealer.quote": { en: "Quote", zh: "报价", ms: "Sebut harga" },
  "dealer.sendQuote": { en: "Send quote", zh: "发送报价", ms: "Hantar sebut harga" },
  "dealer.counter": { en: "Counter offer", zh: "还价", ms: "Tawaran balas" },
  "dealer.approve": { en: "Approve", zh: "批准", ms: "Lulus" },
  "dealer.reject": { en: "Reject", zh: "拒绝", ms: "Tolak" },
  "dealer.accept": { en: "Accept", zh: "接受", ms: "Terima" },
  "dealer.noRequests": { en: "No requests yet.", zh: "还没有请求。", ms: "Tiada permintaan lagi." },
  "dealer.requestNote": { en: "Note", zh: "备注", ms: "Nota" },

  "set.shop": { en: "Shop settings", zh: "商店设置", ms: "Tetapan kedai" },
  "set.open": { en: "Shop open for orders", zh: "开放接单", ms: "Kedai buka untuk pesanan" },
  "set.currency": { en: "Currency symbol", zh: "货币符号", ms: "Simbol mata wang" },
  "set.qr": { en: "DuitNow QR image", zh: "DuitNow QR 图片", ms: "Imej DuitNow QR" },
  "set.uploadQr": { en: "Upload QR image", zh: "上传 QR 图片", ms: "Muat naik imej QR" },
  "set.myUserId": { en: "My user ID", zh: "我的用户 ID", ms: "ID pengguna saya" },
  "set.shopLink": { en: "Public shop link", zh: "公开商店链接", ms: "Pautan kedai awam" },
  "set.appearance": { en: "Public shop appearance", zh: "公开商店外观", ms: "Penampilan kedai awam" },
  "set.publicTheme": { en: "Theme", zh: "主题", ms: "Tema" },
  "set.buttonColor": { en: "Button colour", zh: "按钮颜色", ms: "Warna butang" },
  "set.resetColor": { en: "Reset", zh: "重置", ms: "Tetapkan semula" },
  "set.appearanceSaved": { en: "Appearance saved", zh: "外观已保存", ms: "Penampilan disimpan" },
  "set.theme.ocean": { en: "Ocean", zh: "深海", ms: "Laut" },
  "set.theme.mint": { en: "Mint", zh: "薄荷", ms: "Pudina" },
  "set.theme.coral": { en: "Coral", zh: "珊瑚", ms: "Karang" },

  "err.OUT_OF_STOCK": { en: "Out of stock:", zh: "库存不足：", ms: "Kehabisan stok:" },
  "err.SHOP_CLOSED": { en: "The shop is closed.", zh: "商店已关闭。", ms: "Kedai ditutup." },
  "err.PROMO_INVALID": {
    en: "Promo code is not valid.",
    zh: "优惠码无效。",
    ms: "Kod promosi tidak sah.",
  },
  "err.PROMO_EXPIRED": {
    en: "Promo code has expired.",
    zh: "优惠码已过期。",
    ms: "Kod promosi tamat tempoh.",
  },
  "err.PROMO_NOT_STARTED": {
    en: "Promo code is not active yet.",
    zh: "优惠码尚未开始。",
    ms: "Kod promosi belum bermula.",
  },
  "err.PROMO_USED_UP": {
    en: "Promo code is used up.",
    zh: "优惠码已用完。",
    ms: "Kod promosi telah habis.",
  },
  "err.PROMO_MIN_AMOUNT": {
    en: "Order is below the promo minimum.",
    zh: "订单金额低于优惠码门槛。",
    ms: "Pesanan di bawah minimum promosi.",
  },
  "err.EMPTY_CART": { en: "Your cart is empty.", zh: "购物车是空的。", ms: "Troli anda kosong." },
  "err.INVALID_NAME": {
    en: "Please enter your name.",
    zh: "请输入姓名。",
    ms: "Sila masukkan nama anda.",
  },
  "err.INVALID_AGE": {
    en: "Please enter an age between 5 and 100.",
    zh: "请输入 5 至 100 之间的年龄。",
    ms: "Sila masukkan umur antara 5 hingga 100.",
  },
  "err.INVALID_CLASS": {
    en: "Class is too long.",
    zh: "班级名称过长。",
    ms: "Nama kelas terlalu panjang.",
  },
  "err.PRODUCT_INACTIVE": {
    en: "A product is no longer on sale.",
    zh: "某个产品已下架。",
    ms: "Satu produk tidak lagi dijual.",
  },
  "err.PRODUCT_NOT_FOUND": {
    en: "Product not found.",
    zh: "找不到产品。",
    ms: "Produk tidak dijumpai.",
  },
  "err.NEGATIVE_STOCK": {
    en: "Stock cannot go below zero.",
    zh: "库存不能为负。",
    ms: "Stok tidak boleh negatif.",
  },
  "err.INVALID_APPEARANCE": { en: "Choose a valid theme and colour.", zh: "请选择有效的主题和颜色。", ms: "Pilih tema dan warna yang sah." },
  "err.FORBIDDEN": {
    en: "You are not allowed to do that.",
    zh: "你没有权限执行此操作。",
    ms: "Anda tiada kebenaran.",
  },
} as const;

export type TKey = keyof typeof dict;

const STORAGE_KEY = "schoolorder.lang";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string };

const LanguageContext = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (k) => dict[k].en,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && LANGS.some((l) => l.code === stored)) {
      setLangState(stored);
      return;
    }
    const nav = window.navigator.language.toLowerCase();
    if (nav.startsWith("zh")) setLangState("zh");
    else if (nav.startsWith("ms")) setLangState("ms");
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l === "zh" ? "zh-CN" : l;
  }, []);

  const t = useCallback((k: TKey) => dict[k][lang] ?? dict[k].en, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  return useContext(LanguageContext);
}

/** Maps a database/RPC error message to a translated, safe message. */
export function translateError(t: (k: TKey) => string, message?: string | null): string {
  if (!message) return t("common.error");
  const raw = message.replace(/^.*?:\s*/, (m) => m);
  const code = message.split(":")[0]?.trim();
  const key = `err.${code}` as TKey;
  if (code && key in dict) {
    const detail = message.includes(":") ? message.slice(message.indexOf(":") + 1).trim() : "";
    return detail ? `${t(key)} ${detail}` : t(key);
  }
  if (raw.toLowerCase().includes("invalid login")) {
    return "Email or password is incorrect.";
  }
  return message;
}
