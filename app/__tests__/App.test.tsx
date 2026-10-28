/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  let app!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    app = ReactTestRenderer.create(<App />);
  });
  // Unmounting stops the app's two-minute sync timer, which would otherwise
  // keep the Jest worker alive after the run.
  await ReactTestRenderer.act(() => {
    app.unmount();
  });
});
