/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// The app looks for lesson updates at start-up; the test must not reach the real server.
jest.mock('../src/sync/supabase', () => ({
  ...jest.requireActual('../src/sync/supabase'),
  supabaseUpdates: { listReleases: async () => [], fetchPackage: async () => '' },
}));

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
