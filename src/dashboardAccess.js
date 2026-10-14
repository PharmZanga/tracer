export const isAdministrator = role => ['admin','super_admin'].includes(role);
export const isAdministrationPage = page => ['reports','imports','viewers'].includes(page);
export const canAccessDashboardPage = (role,page) => !isAdministrationPage(page)||isAdministrator(role);
