import '@onebrief/ux-kit/styles.css';
import '@onebrief/atlas-ui/styles.css';
import './standalone.css';

import { createRoot } from 'react-dom/client';

import { browserRequest } from './api.ts';
import { FlightdeckApp } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Flightdeck root element is missing.');
createRoot(root).render(<FlightdeckApp request={browserRequest} />);
