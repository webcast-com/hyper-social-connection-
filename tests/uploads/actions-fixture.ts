// Substitute only server persistence. Browser components and upload helper are real.
declare global {
  interface Window {
    uploadActions: { name: string; value: unknown }[];
    failUploadAction: boolean;
  }
}
async function record(name: string, value: unknown) {
  if (window.failUploadAction) throw new Error('Could not save changes.');
  window.uploadActions.push({ name, value });
}
export const createPost = (data: FormData) => record('post', Object.fromEntries(data));
export const createStory = (url: string) => record('story', url);
export const updateAvatar = (url: string) => record('avatar', url);
export const updateCoverPhoto = (url: string) => record('cover', url);
export const sendMessage = (id: number, data: FormData) => record('message', { id, ...Object.fromEntries(data) });
