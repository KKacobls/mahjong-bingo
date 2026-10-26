import { simulate } from './math.mjs';
self.onmessage = ({ data }) => {
  const rows = simulate(data, progress => self.postMessage({ progress }));
  self.postMessage({ rows });
};
