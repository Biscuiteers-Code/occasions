# Shopify Integration Guide

## Option 1: Liquid Template (Recommended)

1. **Upload the Liquid file** (`shopify-customer-event-form.liquid`) to your Shopify theme:
   - Go to Online Store > Themes > Actions > Edit code
   - Create a new template or section
   - Paste the Liquid code

2. **Update the API endpoint URL**:
   - Replace `YOUR_API_ENDPOINT_URL` with your actual API endpoint
   - Example: `https://your-app.vercel.app`

3. **Add to your store**:
   - Include the template in a page or product template
   - The form will automatically detect logged-in customers

## Option 2: React Component

Use the `ShopifyCustomerForm` component if you're building a custom Shopify app or using React in your theme.

## Features

- **Auto-populated customer GID**: Automatically fills the customer field for logged-in users
- **Login requirement**: Shows login prompt for non-authenticated users  
- **Responsive design**: Works on all device sizes
- **Error handling**: Displays success/error messages
- **Validation**: Ensures all required fields are completed

## Customer Authentication

The form checks for Shopify's customer object and automatically:
- Populates the customer GID field
- Shows customer name in the header
- Redirects to login if no customer is found

## Styling

The Liquid template includes complete CSS styling. Customize the colors and layout by modifying the `<style>` section to match your theme.
