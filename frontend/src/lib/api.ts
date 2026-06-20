import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin-secret-key';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ADMIN_KEY}`
  }
});
