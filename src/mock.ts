export const mockPromise = () => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(null);
        }, 1500);
    });
};