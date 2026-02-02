# Multi-Page Refactoring Documentation

## Overview
This repository has been refactored from a single-page application (SPA) to a multi-page structure for better organization and maintainability.

## Page Structure

### 1. index.html (Main Catalog)
- **Purpose**: Product catalog, search, and filtering
- **URL**: `/index.html` or `/`
- **Features**:
  - Product listing and categories
  - Advanced search with filters
  - Product gallery and image preview
  - Add to cart functionality
  - Favorites management

### 2. cart.html (Shopping Cart)
- **Purpose**: Shopping cart management
- **URL**: `/cart.html`
- **Features**:
  - View cart items
  - Update quantities
  - Remove items
  - View total price
  - Checkout (redirects to order form on index.html)

### 3. profile.html (User Profile)
- **Purpose**: User authentication and account management
- **URL**: `/profile.html`
- **Features**:
  - Login / Registration
  - View profile information
  - Access to orders
  - Chat support
  - Link to stock management (for sellers)
  - Favorites
  - Settings

### 4. stock.html (Warehouse Management)
- **Purpose**: Seller/Admin dashboard for inventory and orders
- **URL**: `/stock.html`
- **Features**:
  - Add products
  - Manage orders
  - View statistics (products, orders, revenue, profit)
  - Profit reports
  - Expense tracking
  - Partner management
  - Agent management

## Navigation

### Bottom Navigation Bar
The bottom navigation bar appears on all pages and provides quick access to main features:
- 🏠 **Главная** (Home) → index.html
- 📂 **Меню** (Categories) → Opens categories panel
- 🛒 **Корзина** (Cart) → cart.html
- 💬 **Чат** (Chat) → profile.html
- 👤 **Профиль** (Profile) → profile.html

## Shared JavaScript

### js/main.js
Central shared functionality:
- Firebase initialization
- Partner referral system
- Client ID management
- Scroll locking utilities
- Navigation active state management

### Page-Specific JavaScript
Each page loads only the necessary JavaScript modules:

**index.html:**
- All product-related modules (filters, search, upload, gallery, etc.)
- Cart, orders, seller management (for admin features)

**cart.html:**
- cart.js (cart management)
- helpers.js (utilities)

**profile.html:**
- customer-auth.js (authentication)
- chat.js (support chat)
- orders.js (order history)
- helpers.js (utilities)

**stock.html:**
- seller.js (seller authentication)
- orders-management.js (order management)
- profit-report.js (analytics)
- expenses.js (expense tracking)
- partners.js (partner management)
- agents.js (agent program)
- helpers.js (utilities)

## Key Changes

1. **Navigation**: Changed from JavaScript `onclick` handlers to HTML `<a href>` links for main pages
2. **Firebase**: Centralized initialization in `main.js` instead of duplicating in each page
3. **Functions**: Updated `openCartPage()` and `openCustomerAccount()` to redirect to new pages instead of opening modals
4. **CSS**: Each page includes inline styles for simplicity (can be further centralized to styles.css)
5. **Backward Compatibility**: Original modal-based cart and profile sections still exist in index.html for backward compatibility

## File Organization

```
/
├── index.html          # Main catalog page
├── cart.html           # Shopping cart page
├── profile.html        # User profile page
├── stock.html          # Warehouse management page
├── css/
│   └── styles.css      # Shared styles
├── js/
│   ├── main.js         # Shared core functionality (NEW)
│   ├── bottom-nav.js   # Navigation bar (UPDATED)
│   ├── cart.js         # Cart functionality (UPDATED)
│   ├── customer-auth.js # Authentication (UPDATED)
│   └── [other modules] # Page-specific modules
└── manifest.json       # PWA manifest
```

## GitHub Pages Compatibility

✅ All pages use relative paths
✅ No build process required
✅ Pure HTML, CSS, JavaScript
✅ PWA functionality preserved
✅ All external libraries loaded via CDN

## Testing Checklist

- [ ] Navigation between pages works correctly
- [ ] Cart badge counter updates across pages
- [ ] Firebase connection works on all pages
- [ ] Cart functionality (add, remove, update)
- [ ] Profile login/logout
- [ ] Stock management (seller authentication)
- [ ] Mobile responsiveness
- [ ] PWA installation
- [ ] All links use relative paths
- [ ] No console errors

## Future Improvements

1. Further centralize CSS from inline styles to styles.css
2. Implement lazy loading for page-specific JavaScript
3. Add service worker for offline cart functionality
4. Enhance SEO with proper meta tags for each page
5. Add page transitions for smoother navigation
