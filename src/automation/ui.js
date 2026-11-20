let controller;
export function attachUI(value) { controller = value; return () => { if (controller === value) controller = null; }; }
export const getUI = () => controller;
