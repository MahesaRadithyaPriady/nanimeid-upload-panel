# Admin Auth API

- **Route file**: `src/routes/admin.routes.js`
- **Controller**: `src/controllers/admin.controller.js`

## POST /admin/auth/login

- **Auth**: Public (no token)
- **Description**: Authenticate admin and issue JWT token.

### Request

- **Headers**
  - `Content-Type: application/json`

- **Body**
  - `username` (string, required)
  - `password` (string, required)

```json
{
  "username": "admin01",
  "password": "yourStrongPassword"
}
```

### Responses

- **200 OK**
  - Login success
  - Body
    - `message` (string)
    - `token` (string, JWT)
    - `admin` (object)

```json
{
  "message": "Login admin success",
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "admin": {
    "id": "123",
    "username": "admin01",
    "email": "admin@example.com",
    "role": "SUPERADMIN"
  }
}
```

- **400 Bad Request**
  - Missing `username` or `password`

```json
{ "message": "username dan password wajib" }
```

- **401 Unauthorized**
  - Invalid credentials or authentication error
  - Error format from `sendError()`

```json
{
  "success": false,
  "code": "INVALID_CREDENTIALS",
  "message": "Username atau password salah"
}
```

### Example cURL

```bash
curl -X POST https://your-api-domain/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin01",
    "password": "yourStrongPassword"
  }'
```

### Notes

- Controller `adminLogin()` validates `username` and `password` then calls `loginAdmin({ username, password })` to verify and create token.
- On errors, controller uses `sendError(res, 401, e)` which returns a standardized JSON error.
