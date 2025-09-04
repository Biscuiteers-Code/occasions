# Shopify App Setup Instructions

## 1. Create Shopify App
1. Go to your Shopify Partner Dashboard
2. Create a new app or use an existing one
3. Get your Admin API access token

## 2. Create Metaobject Definition
Before using this app, you need to create a metaobject definition in your Shopify admin:

1. Go to Shopify Admin → Settings → Custom data
2. Click "Add definition" under Metaobjects
3. Create a new definition with:
   - **Type**: `customer_submission`
   - **Name**: Customer Submission
   - **Fields**:
     - `name` (Single line text)
     - `email` (Single line text) 
     - `phone` (Single line text)
     - `message` (Multi-line text)
     - `preferences` (Single line text)
     - `submitted_at` (Single line text)

## 3. Environment Variables
Add these to your Vercel project settings:

\`\`\`
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_admin_api_access_token
\`\`\`

## 4. Required Shopify API Permissions
Your app needs these permissions:
- `write_metaobjects`
- `read_metaobjects`

## 5. Testing
1. Fill out the form on your website
2. Check Shopify Admin → Settings → Custom data → Metaobjects
3. You should see new "Customer Submission" entries
