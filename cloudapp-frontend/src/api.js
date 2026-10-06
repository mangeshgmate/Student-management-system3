// Fallback to EC2 IP if environment variable is not defined
export const API_BASE_URL = "/api";

// Example helper for fetch requests
export const fetchAPI = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
};
