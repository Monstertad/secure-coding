# secure-coding
# secure-coding

``` tiny-secondhand-platform/
│
├── README.md
├── package.json
├── .gitignore
├── .env
│
├── app.js
├── server.js
│
├── config/
│   ├── db.js
│   ├── session.js
│   └── multer.js
│
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── products.js
│   ├── chat.js
│   ├── reports.js
│   ├── admin.js
│   └── transfer.js
│
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   ├── productController.js
│   ├── chatController.js
│   ├── reportController.js
│   ├── adminController.js
│   └── transferController.js
│
├── services/
│   ├── authService.js
│   ├── productService.js
│   ├── reportService.js
│   └── transferService.js
│
├── models/
│   ├── userModel.js
│   ├── productModel.js
│   ├── reportModel.js
│   ├── messageModel.js
│   └── transferModel.js
│
├── middleware/
│   ├── auth.js
│   ├── admin.js
│   ├── validate.js
│   ├── rateLimiter.js
│   ├── uploadFilter.js
│   └── errorHandler.js
│
├── utils/
│   ├── logger.js
│   ├── sanitizer.js
│   ├── validator.js
│   └── crypto.js
│
├── uploads/
│   └── products/
│
├── public/
│   ├── css/
│   ├── js/
│   └── images/
│
├── views/
│   ├── partials/
│   │     header.ejs
│   │     footer.ejs
│   │
│   ├── auth/
│   │     login.ejs
│   │     register.ejs
│   │
│   ├── users/
│   │     profile.ejs
│   │     users.ejs
│   │
│   ├── products/
│   │     list.ejs
│   │     detail.ejs
│   │     create.ejs
│   │     edit.ejs
│   │
│   ├── chat/
│   │     global.ejs
│   │     dm.ejs
│   │
│   ├── reports/
│   │     report.ejs
│   │
│   ├── admin/
│   │     dashboard.ejs
│   │     users.ejs
│   │     reports.ejs
│   │     products.ejs
│   │
│   └── index.ejs
│
├── sockets/
│   └── chat.js
│
├── sql/
│   ├── schema.sql
│   └── seed.sql
│
└── tests/
    ├── auth.test.js
    ├── product.test.js
    └── security.test.js 
```
