# Complete Workflow Test Guide

## Setup Instructions

### 1. Deploy Your v0 Project
1. Click "Publish" in v0 to deploy to Vercel
2. Note your deployed URL (e.g., `https://your-project.vercel.app`)
3. Ensure environment variables are set:
   - `STORE_DOMAIN` = your store domain (e.g., `1eq5ty-dr`)
   - `SHOPIFY_ACCESS_TOKEN` = your Shopify access token

### 2. Add Blocks to Shopify Page
1. Go to your Shopify admin → Online Store → Pages
2. Create or edit a page (e.g., "My Account" or "Occasions")
3. Add both blocks to the page:
   - **"My Occasions"** block (displays existing occasions)
   - **"Add Occasions"** block (form for creating/editing)

### 3. Configure Block Settings
**My Occasions Block:**
- Set "API endpoint URL" to: `https://your-project.vercel.app/api/create-metaobject`
- Configure gift URLs for each occasion type (optional)

**Add Occasions Block:**
- Set "API endpoint URL" to: `https://your-project.vercel.app/api/create-metaobject`
- Set button label (e.g., "Add Occasion")

## Complete Workflow Test

### Test 1: Create New Occasion
1. **Navigate to your page** while logged in as a customer
2. **Scroll to "Add Occasions" form**
3. **Fill out the form:**
   - Date: Select a future date
   - Occasion Type: Choose from dropdown (should load dynamically)
   - Occasion Name: Enter a name (e.g., "John's Birthday")
4. **Click "Add Occasion"**
5. **Expected Result:** Success message appears, form clears
6. **Check:** "My Occasions" section should refresh and show the new occasion

### Test 2: View Occasions Display
1. **Check "My Occasions" section** at top of page
2. **Expected Result:** 
   - Two-column grid layout
   - Each occasion shows name and formatted date (e.g., "15th August")
   - Pink "Find a gift" buttons
   - Three dots (⋯) edit buttons
   - "add an occasion" button in empty space

### Test 3: Edit Existing Occasion
1. **Click the three dots (⋯)** on any occasion
2. **Expected Result:** 
   - Page scrolls to form
   - Form populates with occasion data
   - Button changes to "Update Occasion"
   - Delete button appears
3. **Modify some data** (e.g., change date or name)
4. **Click "Update Occasion"**
5. **Expected Result:** Success message, occasions display refreshes with changes

### Test 4: Delete Occasion
1. **Edit an occasion** (follow Test 3 steps 1-2)
2. **Click "Delete Occasion"** button
3. **Confirm deletion** in popup
4. **Expected Result:** 
   - Success message appears
   - Form clears to create mode
   - Occasions display refreshes (occasion removed)

### Test 5: Add Another Occasion
1. **Click "add an occasion"** button in occasions display
2. **Expected Result:** 
   - Page scrolls to form
   - Form is in create mode (empty fields)
   - Button shows "Add Occasion"
3. **Create another occasion**
4. **Expected Result:** Both occasions appear in display

### Test 6: Gift Button Navigation
1. **Configure gift URLs** in "My Occasions" block settings
2. **Click "Find a gift for [date]"** button
3. **Expected Result:** Navigates to configured URL for that occasion type

## Troubleshooting

### Common Issues

**"Network error: Cannot reach API endpoint"**
- Check API endpoint URL is full URL, not relative path
- Verify your v0 project is deployed and accessible
- Check environment variables are set correctly

**"Dynamic lookup failed, keeping hardcoded options"**
- API endpoint must be full URL for dynamic dropdown
- Check CORS headers are working
- Verify get-metaobject-definition endpoint is accessible

**"No occasions found"**
- Check customer is logged in
- Verify metaobjects are being created in Shopify
- Check get-occasions API endpoint is working

**Edit button doesn't work**
- Ensure both blocks are on the same page
- Check browser console for JavaScript errors
- Verify populateFormForEdit function is available

### Debug Steps

1. **Open browser developer tools** (F12)
2. **Check Console tab** for error messages
3. **Look for [v0] debug messages** showing API calls and responses
4. **Verify API endpoints** are being called with correct URLs
5. **Check Network tab** for failed requests

## API Endpoints Used

- `POST /api/create-metaobject` - Create/update occasions
- `POST /api/delete-metaobject` - Delete occasions  
- `POST /api/get-occasions` - Fetch customer occasions
- `POST /api/get-metaobject-definition` - Get dropdown options

## Expected User Experience

1. **Customer visits page** → sees their existing occasions in a clean grid
2. **Wants to add occasion** → clicks "add an occasion" → scrolls to form
3. **Fills form** → creates occasion → sees it appear in grid immediately
4. **Wants to edit** → clicks ⋯ → form populates → makes changes → updates
5. **Wants to delete** → edits occasion → clicks delete → confirms → gone
6. **Wants gifts** → clicks "Find a gift" → goes to relevant product page

The complete workflow provides a seamless experience for customers to manage their occasion reminders with immediate visual feedback and smooth navigation between viewing and editing modes.
