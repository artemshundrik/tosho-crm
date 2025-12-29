import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './index.css';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider
      defaultColorScheme="light"
      theme={{
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
        headings: {
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
          sizes: {
            h1: { fontSize: '32px', lineHeight: '1.2', fontWeight: '700' },
            h2: { fontSize: '24px', lineHeight: '1.3', fontWeight: '600' },
            h3: { fontSize: '20px', lineHeight: '1.3', fontWeight: '600' },
          },
        },
        colors: {
          brand: [
            '#f4f5ff',
            '#e0e4ff',
            '#c2c7ff',
            '#9aa3ff',
            '#7a85ff',
            '#5f6bff',
            '#4c58f0',
            '#4049c4',
            '#343da0',
            '#262b66',
          ],
        },
        primaryColor: 'brand',
        primaryShade: { light: 5, dark: 6 },
        radius: {
          xs: '4px',
          sm: '8px',
          md: '12px',
          lg: '16px',
          xl: '24px',
        },
        defaultRadius: 'md',
        spacing: {
          xs: '4px',
          sm: '8px',
          md: '12px',
          lg: '16px',
          xl: '24px',
        },
      }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </MantineProvider>
  </React.StrictMode>,
);
