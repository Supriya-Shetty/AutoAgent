document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignupBtn = document.getElementById('showSignup');
    const showLoginBtn = document.getElementById('showLogin');
    const authWrapper = document.getElementById('authWrapper');

    // Function to switch to Signup
    const switchToSignup = () => {
        loginForm.classList.add('hidden');
        loginForm.setAttribute('aria-hidden', 'true');
        
        signupForm.classList.remove('hidden');
        signupForm.setAttribute('aria-hidden', 'false');
        signupForm.classList.add('fade-in');
        
        authWrapper.dataset.view = 'signup';
        
        // Focus management for accessibility
        const firstInput = signupForm.querySelector('input');
        if (firstInput) firstInput.focus();
    };

    // Function to switch to Login
    const switchToLogin = () => {
        signupForm.classList.add('hidden');
        signupForm.setAttribute('aria-hidden', 'true');
        
        loginForm.classList.remove('hidden');
        loginForm.setAttribute('aria-hidden', 'false');
        loginForm.classList.add('fade-in');
        
        authWrapper.dataset.view = 'login';
        
        // Focus management
        const firstInput = loginForm.querySelector('input');
        if (firstInput) firstInput.focus();
    };

    // Event Listeners
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        switchToSignup();
    });

    showLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        switchToLogin();
    });
});