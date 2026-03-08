tailwind.config = {
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#f0fdfa',
                    100: '#ccfbf1',
                    400: '#2dd4bf',
                    500: '#14b8a6',
                    600: '#0d9488',
                    900: '#134e4a',
                },
                dark: {
                    bg: '#0f172a',
                    surface: '#1e293b',
                    card: 'rgba(30, 41, 59, 0.7)',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        }
    }
}

// Tab switching for Copilot Chat graphic
function showTab(tabId, btn) {
    document.querySelectorAll('.chat-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.chat-tab').forEach(b => b.classList.remove('active-tab'));
    document.getElementById(tabId).classList.remove('hidden');
    btn.classList.add('active-tab');
}
