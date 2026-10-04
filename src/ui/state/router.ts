import { useEffect, useState } from 'react';

/** Hash router: #/route?query — works on static hosting and from file://. */
export function useRoute(): { path: string; query: URLSearchParams } {
  const parse = () => {
    const h = window.location.hash.replace(/^#/, '') || '/';
    const [path, q] = h.split('?');
    return { path: path || '/', query: new URLSearchParams(q ?? '') };
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const navigate = (path: string) => {
  window.location.hash = path;
};
