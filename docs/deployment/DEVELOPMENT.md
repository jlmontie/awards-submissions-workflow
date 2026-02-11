# Development Guide

> **📘 Back to Main Documentation:** [README.md](../README.md)

This guide covers local development and testing of the Awards Submission System.

**For production deployment, see [QUICKSTART.md](../QUICKSTART.md) or [DEPLOYMENT.md](DEPLOYMENT.md).**

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Setup](#local-setup)
3. [Frontend Development](#frontend-development)
4. [Backend Development](#backend-development)
5. [Testing](#testing)
6. [Debugging](#debugging)

## Prerequisites

### Required Software

- **Node.js** >= 18.x ([Download](https://nodejs.org/))
- **Python** >= 3.11 ([Download](https://python.org/))
- **gcloud CLI** ([Install](https://cloud.google.com/sdk/docs/install))
- **Terraform** >= 1.5 ([Install](https://terraform.io/downloads))
- **Git** ([Install](https://git-scm.com/))

### Optional Tools

- **Docker** (for container testing)
- **ngrok** (for webhook testing)
- **Postman** (for API testing)

## Local Setup

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd awards-submissions-workflow
```

### 2. Authenticate with Google Cloud

```bash
# Login
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Get application default credentials
gcloud auth application-default login
```

### 3. Install Dependencies

#### Frontend

```bash
cd frontend
npm install
```

#### Backend

```bash
cd backend/pdf-processor
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

cd ../photo-processor
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Frontend Development

### Running Development Server

```bash
cd frontend

# Create .env.local for local development
cat > .env.local << EOF
GCP_PROJECT_ID=your-project-id
NEXT_PUBLIC_GCS_BUCKET=your-dev-bucket
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-recaptcha-key
PUBLIC_ASSETS_BUCKET=your-public-bucket
EOF

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Hot Reload

Next.js automatically reloads when you edit files:

- `src/app/` - Pages
- `src/components/` - React components
- `src/lib/` - Utilities

### Building for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Backend Development

### Testing Cloud Functions Locally

#### Using Functions Framework

##### PDF Processor

```bash
cd backend/pdf-processor
source venv/bin/activate

# Set environment variables
export GCP_PROJECT_ID=your-project-id
export DRIVE_FOLDER_SECRET=your-drive-folder-secret
export SHEET_ID_SECRET=your-sheet-id-secret
export SUBMISSIONS_BUCKET=your-bucket-name
export MAX_PDF_SIZE_MB=50

# Start function locally
functions-framework --target=process_pdf --debug
```

##### Photo Processor

```bash
cd backend/photo-processor
source venv/bin/activate

# Set environment variables
export GCP_PROJECT_ID=your-project-id
export DRIVE_FOLDER_SECRET=your-drive-folder-secret
export SUBMISSIONS_BUCKET=your-bucket-name
export MAX_PHOTO_SIZE_MB=20

# Start function locally
functions-framework --target=process_photo --debug
```

#### Testing with Sample Events

Create a test event file `test-event.json`:

```json
{
  "data": {
    "bucket": "your-test-bucket",
    "name": "submissions/2024/01/test-id/pdf/test.pdf",
    "contentType": "application/pdf",
    "size": "1024000"
  }
}
```

Send test event:

```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d @test-event.json
```

### Testing PDF Field Extraction

Create a test script `test-pdf.py`:

```python
import PyPDF2
import sys

def test_pdf(pdf_path):
    with open(pdf_path, 'rb') as file:
        reader = PyPDF2.PdfReader(file)
        
        print(f"Pages: {len(reader.pages)}")
        print("\nForm Fields:")
        
        fields = reader.get_fields()
        if fields:
            for name, field in fields.items():
                value = field.get('/V', '')
                print(f"  {name}: {value}")
        else:
            print("  No form fields found")

if __name__ == "__main__":
    test_pdf(sys.argv[1])
```

Run:

```bash
python test-pdf.py path/to/your/form.pdf
```

### Unit Testing

#### Backend Tests

Create `backend/pdf-processor/test_main.py`:

```python
import unittest
from unittest.mock import Mock, patch
from main import extract_pdf_fields, normalize_field_data

class TestPDFProcessor(unittest.TestCase):
    
    def test_extract_pdf_fields(self):
        # Mock PDF with test fields
        with open('test-data/sample.pdf', 'rb') as f:
            pdf_bytes = f.read()
        
        fields = extract_pdf_fields(pdf_bytes)
        
        self.assertIsInstance(fields, dict)
        self.assertIn('project_name', fields)
    
    def test_normalize_field_data(self):
        test_fields = {
            'project_name': 'Test Project',
            'Location': '123 Main St'
        }
        
        normalized = normalize_field_data(test_fields)
        
        self.assertIn('submission_date', normalized)
        self.assertEqual(normalized['project_name'], 'Test Project')

if __name__ == '__main__':
    unittest.main()
```

Run tests:

```bash
python -m pytest test_main.py -v
```

#### Frontend Tests

Install testing libraries:

```bash
cd frontend
npm install --save-dev @testing-library/react @testing-library/jest-dom jest
```

Create `frontend/src/components/__tests__/FileUpload.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import FileUpload from '../FileUpload';

describe('FileUpload', () => {
  it('renders upload zone', () => {
    render(
      <FileUpload
        accept=".pdf"
        maxFiles={1}
        onFilesSelected={jest.fn()}
      />
    );
    
    expect(screen.getByText(/drag & drop/i)).toBeInTheDocument();
  });
});
```

Run tests:

```bash
npm test
```

## Testing

### End-to-End Testing

#### Manual Testing Checklist

1. **Download Form**
   - [ ] Blank form downloads correctly
   - [ ] PDF opens and is fillable

2. **Upload PDF**
   - [ ] File selection works
   - [ ] Drag & drop works
   - [ ] Upload progress shows
   - [ ] Large files handled

3. **Upload Photos**
   - [ ] Multiple photos can be selected
   - [ ] Different formats accepted (JPEG, PNG, HEIC)
   - [ ] Progress tracking works

4. **Submission**
   - [ ] reCAPTCHA executes
   - [ ] Files upload to GCS
   - [ ] Cloud Functions trigger
   - [ ] Drive folder created
   - [ ] Sheet row added
   - [ ] Success message shows

5. **Error Handling**
   - [ ] Invalid file type rejected
   - [ ] File too large rejected
   - [ ] Network errors handled
   - [ ] Timeout handled

#### Automated E2E Tests

Using Playwright:

```bash
cd frontend
npm install --save-dev @playwright/test

npx playwright test
```

Create `frontend/e2e/submission.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('complete submission flow', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Download form
  const download = page.waitForEvent('download');
  await page.click('text=Download Submission Form');
  await download;
  
  // Start upload
  await page.click('text=Start Upload');
  
  // Upload PDF
  await page.setInputFiles('input[type="file"]', 'test-data/sample.pdf');
  
  // Upload photos
  await page.setInputFiles('input[type="file"]', [
    'test-data/photo1.jpg',
    'test-data/photo2.jpg'
  ]);
  
  // Submit
  await page.click('text=Submit Entry');
  
  // Wait for success
  await expect(page.locator('text=Submission Successful')).toBeVisible({
    timeout: 60000
  });
});
```

### Load Testing

Using Apache Bench:

```bash
# Test download endpoint
ab -n 100 -c 10 https://your-app-url/api/download-form

# Test upload URL generation
ab -n 100 -c 10 -p test-payload.json -T application/json \
  https://your-app-url/api/get-upload-url
```

## Debugging

### Frontend Debugging

#### Browser DevTools

1. Open Chrome DevTools (F12)
2. Go to Sources tab
3. Set breakpoints in TypeScript files
4. Trigger actions to hit breakpoints

#### React DevTools

Install [React DevTools](https://react.dev/learn/react-developer-tools) extension.

#### Network Debugging

1. Open Network tab in DevTools
2. Filter by "XHR" or "Fetch"
3. Inspect request/response

### Backend Debugging

#### Cloud Function Logs

```bash
# Real-time logs
gcloud functions logs tail YOUR_FUNCTION_NAME --region=us-central1

# Filter logs
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=YOUR_FUNCTION_NAME" \
  --limit=50 \
  --format=json
```

#### Local Debugging

Use Python debugger:

```python
import pdb

def process_pdf(cloud_event):
    pdb.set_trace()  # Set breakpoint
    # ... rest of code
```

#### VS Code Debugging

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Cloud Function",
      "type": "python",
      "request": "launch",
      "module": "functions_framework",
      "args": [
        "--target=process_pdf",
        "--debug"
      ],
      "env": {
        "GCP_PROJECT_ID": "your-project-id"
      }
    }
  ]
}
```

### Common Issues

#### "Module not found" Error

```bash
# Frontend
cd frontend
rm -rf node_modules package-lock.json
npm install

# Backend
cd backend/pdf-processor
pip install -r requirements.txt --force-reinstall
```

#### Authentication Errors

```bash
# Re-authenticate
gcloud auth application-default login

# Check credentials
gcloud auth list
```

#### CORS Errors

Add to `frontend/next.config.js`:

```javascript
async headers() {
  return [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
      ],
    },
  ];
}
```

## Development Workflow

### Feature Development

1. Create feature branch:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make changes and test locally

3. Run linters:
   ```bash
   cd frontend && npm run lint
   cd backend && black . && flake8
   ```

4. Commit changes:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

5. Push and create PR:
   ```bash
   git push origin feature/your-feature
   ```

### Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for full deployment guide.

Quick deploy:

```bash
# Frontend
cd frontend
gcloud run deploy awards-frontend --source .

# Backend (via Terraform)
cd terraform
terraform apply
```

## Tips & Best Practices

1. **Environment Variables**: Never commit secrets! Use `.env.local` (gitignored)

2. **API Keys**: Use Secret Manager for production, env vars for development

3. **File Uploads**: Test with various file sizes and types

4. **Error Handling**: Always handle network failures gracefully

5. **Logging**: Use structured logging for easier debugging

6. **Testing**: Write tests for critical paths (upload, processing)

7. **Documentation**: Update docs when adding features

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Google Cloud Python Client](https://googleapis.dev/python/google-api-core/latest/)
- [Cloud Functions Framework](https://github.com/GoogleCloudPlatform/functions-framework-python)
- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)

