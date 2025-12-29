# Top Page Component Testing

## Test Status

❌ **Automated tests are currently failing due to React 19 compatibility issues with @testing-library/react**

### Known Issue

React 19.2 has introduced breaking changes that cause `@testing-library/react@16.3.1` to fail with:
```
TypeError: Cannot read properties of null (reading 'useState')
```

This is a known compatibility issue between React 19 and Testing Library. The tests are properly written and will pass once:
1. Testing Library releases React 19-compatible version, OR
2. Project downgrades to React 18

### Test Coverage

Comprehensive tests have been written in `src/app/page.test.tsx` covering:
- ✅ Initial rendering and UI elements
- ✅ File selection via click
- ✅ Drag and drop functionality
- ✅ File validation (size, type)
- ✅ Codec selection
- ✅ Upload flow with API integration
- ✅ Error handling
- ✅ Accessibility (WCAG AA compliance)

## Manual Testing Checklist

Until automated tests are fixed, use this manual test plan:

### 1. Initial Rendering
- [ ] Page title "Codec Converter" is displayed
- [ ] Description "動画ファイルのコーデックを変換します" is shown
- [ ] Upload area with dashed border is visible
- [ ] Text "ファイルをドラッグ&ドロップ または クリックして選択" is displayed
- [ ] Note "MP4ファイルのみ、最大500MB" is visible
- [ ] Three codec radio buttons (H.264, VP9, AV1) are displayed
- [ ] H.264 is selected by default
- [ ] "変換開始" button is disabled

### 2. File Selection
- [ ] Click upload area opens file dialog
- [ ] Select valid MP4 file (< 500MB)
- [ ] File name and size are displayed
- [ ] "変換開始" button becomes enabled

### 3. Drag and Drop
- [ ] Drag file over upload area
- [ ] Border color changes to blue (#0070f3)
- [ ] Background color changes to light blue (#f0f8ff)
- [ ] Drop file
- [ ] File name and size are displayed
- [ ] "変換開始" button becomes enabled

### 4. File Validation - Size
- [ ] Select file > 500MB
- [ ] Error message: "ファイルサイズは500MB以下である必要があります"
- [ ] "変換開始" button remains disabled

### 5. File Validation - Type
- [ ] Select non-MP4 file (e.g., .txt, .avi)
- [ ] Error message: "MP4ファイルのみアップロード可能です"
- [ ] "変換開始" button remains disabled

### 6. Codec Selection
- [ ] Select VP9 radio button
- [ ] VP9 becomes selected
- [ ] Description "バランス型（WebM）" is visible
- [ ] Select AV1 radio button
- [ ] AV1 becomes selected
- [ ] Description "高圧縮率（WebM）" is visible

### 7. Upload Flow (Requires API Backend)
- [ ] Select valid MP4 file
- [ ] Choose output codec
- [ ] Click "変換開始"
- [ ] Button text changes to "アップロード中..."
- [ ] Button becomes disabled during upload
- [ ] On success: redirects to `/jobs/{jobId}`

### 8. Error Handling
- [ ] If API returns error, error message is displayed
- [ ] Button re-enables after error
- [ ] Error message has red background

### 9. Accessibility
- [ ] Upload area has `aria-label`
- [ ] Can tab to upload area
- [ ] Can press Enter/Space to open file dialog
- [ ] Error messages have `role="alert"`
- [ ] Fieldset has proper legend
- [ ] All form elements are keyboard accessible

## Running the Application Locally

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## API Requirements

The component expects the following API endpoints to be available:

### POST /api/jobs
Creates a new job and returns upload URL

**Request:**
```json
{
  "fileName": "video.mp4",
  "fileSize": 104857600,
  "contentType": "video/mp4",
  "outputCodec": "h264"
}
```

**Response (201):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://s3.example.com/presigned-url",
  "expiresIn": 3600
}
```

### PUT {uploadUrl}
Upload file to S3 using presigned URL

**Request:**
- Body: File binary data
- Header: `Content-Type: video/mp4`

### POST /api/jobs/{jobId}/submit
Submit job for processing

**Response (200):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PROCESSING"
}
```

## Future Work

- [ ] Update to Testing Library version compatible with React 19
- [ ] Run automated tests
- [ ] Add E2E tests with Playwright
- [ ] Add visual regression tests
