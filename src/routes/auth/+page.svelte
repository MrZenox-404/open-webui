<script lang="ts">
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';

	import { toast } from 'svelte-sonner';

	import { onMount, getContext, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import { getBackendConfig } from '$lib/apis';
	import {
		ldapUserSignIn,
		getSessionUser,
		userSignIn,
		userSignUp,
		updateUserTimezone
	} from '$lib/apis/auths';

	import { WEBUI_API_BASE_URL, WEBUI_BASE_URL } from '$lib/constants';
	import { WEBUI_NAME, config, user, socket } from '$lib/stores';

	import { generateInitialsImage, canvasPixelTest, getUserTimezone } from '$lib/utils';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import OnBoarding from '$lib/components/OnBoarding.svelte';
	import SensitiveInput from '$lib/components/common/SensitiveInput.svelte';
	import { redirect } from '@sveltejs/kit';

	const i18n = getContext('i18n');

	let loaded = false;

	let mode = $config?.features.enable_ldap ? 'ldap' : 'signin';

	let form = null;

	let name = '';
	let email = '';
	let password = '';
	let confirmPassword = '';

	let ldapUsername = '';

	const setSessionUser = async (sessionUser, redirectPath: string | null = null) => {
		if (sessionUser) {
			console.log(sessionUser);
			toast.success($i18n.t(`You're now logged in.`));
			if (sessionUser.token) {
				localStorage.token = sessionUser.token;
			}
			$socket.emit('user-join', { auth: { token: sessionUser.token } });
			await user.set(sessionUser);
			await config.set(await getBackendConfig());

			// Update user timezone
			const timezone = getUserTimezone();
			if (sessionUser.token && timezone) {
				updateUserTimezone(sessionUser.token, timezone);
			}

			if (!redirectPath) {
				redirectPath = $page.url.searchParams.get('redirect') || '/';
			}

			goto(redirectPath);
			localStorage.removeItem('redirectPath');
		}
	};

	const signInHandler = async () => {
		const sessionUser = await userSignIn(email, password).catch((error) => {
			toast.error(`${error}`);
			return null;
		});

		await setSessionUser(sessionUser);
	};

	const signUpHandler = async () => {
		if ($config?.features?.enable_signup_password_confirmation) {
			if (password !== confirmPassword) {
				toast.error($i18n.t('Passwords do not match.'));
				return;
			}
		}

		const sessionUser = await userSignUp(name, email, password, generateInitialsImage(name)).catch(
			(error) => {
				toast.error(`${error}`);
				return null;
			}
		);

		await setSessionUser(sessionUser);
	};

	const ldapSignInHandler = async () => {
		const sessionUser = await ldapUserSignIn(ldapUsername, password).catch((error) => {
			toast.error(`${error}`);
			return null;
		});
		await setSessionUser(sessionUser);
	};

	const submitHandler = async () => {
		if (mode === 'ldap') {
			await ldapSignInHandler();
		} else if (mode === 'signin') {
			await signInHandler();
		} else {
			await signUpHandler();
		}
	};

	const oauthCallbackHandler = async () => {
		// Get the value of the 'token' cookie
		function getCookie(name) {
			const match = document.cookie.match(
				new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
			);
			return match ? decodeURIComponent(match[1]) : null;
		}

		const token = getCookie('token');
		if (!token) {
			return;
		}

		const sessionUser = await getSessionUser(token).catch((error) => {
			toast.error(`${error}`);
			return null;
		});

		if (!sessionUser) {
			return;
		}

		localStorage.token = token;
		await setSessionUser(sessionUser, localStorage.getItem('redirectPath') || null);
	};

	let onboarding = false;

	// Parallax: track normalized mouse offset (-0.5 .. 0.5)
	let mouseX = 0;
	let mouseY = 0;

	const handleMouseMove = (e) => {
		if (typeof window === 'undefined') return;
		mouseX = e.clientX / window.innerWidth - 0.5;
		mouseY = e.clientY / window.innerHeight - 0.5;
	};

	async function setLogoImage() {
		await tick();
		const logo = document.getElementById('logo');

		if (logo) {
			const isDarkMode = document.documentElement.classList.contains('dark');

			if (isDarkMode) {
				const darkImage = new Image();
				darkImage.src = `${WEBUI_BASE_URL}/static/favicon-dark.png`;

				darkImage.onload = () => {
					logo.src = `${WEBUI_BASE_URL}/static/favicon-dark.png`;
					logo.style.filter = ''; // Ensure no inversion is applied if favicon-dark.png exists
				};

				darkImage.onerror = () => {
					logo.style.filter = 'invert(1)'; // Invert image if favicon-dark.png is missing
				};
			}
		}
	}

	onMount(async () => {
		const redirectPath = $page.url.searchParams.get('redirect');
		if ($user !== undefined) {
			goto(redirectPath || '/');
		} else {
			if (redirectPath) {
				localStorage.setItem('redirectPath', redirectPath);
			}
		}

		const error = $page.url.searchParams.get('error');
		if (error) {
			toast.error(error);
		}

		await oauthCallbackHandler();
		form = $page.url.searchParams.get('form');

		loaded = true;
		setLogoImage();

		if (($config?.features.auth_trusted_header ?? false) || $config?.features.auth === false) {
			await signInHandler();
		} else {
			onboarding = $config?.onboarding ?? false;
		}
	});
</script>

<svelte:head>
	<title>
		{`${$WEBUI_NAME}`}
	</title>
</svelte:head>

<OnBoarding
	bind:show={onboarding}
	getStartedHandler={() => {
		onboarding = false;
		mode = $config?.features.enable_ldap ? 'ldap' : 'signup';
	}}
/>

<svelte:window on:mousemove={handleMouseMove} />

<div class="w-full h-screen max-h-[100dvh] text-white relative overflow-hidden" id="auth-page">
	<!-- Parallax background: RTL towers at blue hour -->
	<div
		class="absolute inset-0 bg-black parallax-bg"
		style="background-image: url('{WEBUI_BASE_URL}/static/rtl_lu.jpg'); transform: translate3d({-mouseX *
			36}px, {-mouseY * 28}px, 0) scale(1.18);"
	></div>

	<!-- Cinematic gradient overlay for contrast -->
	<div
		class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/65 pointer-events-none"
	></div>
	<div
		class="absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-black/55 pointer-events-none"
	></div>

	<!-- Vintage: warm color grade + film grain + vignette -->
	<div class="absolute inset-0 vintage-tint pointer-events-none"></div>
	<div class="absolute inset-0 film-grain pointer-events-none"></div>
	<div class="absolute inset-0 vignette pointer-events-none"></div>

	<!-- Vintage ornamental frame (parallax counter-movement) -->
	<div class="vintage-frame" style="transform: translate3d({mouseX * 10}px, {mouseY * 10}px, 0);">
		<span class="corner corner-tl"></span>
		<span class="corner corner-tr"></span>
		<span class="corner corner-bl"></span>
		<span class="corner corner-br"></span>
	</div>

	<div class="w-full absolute top-0 left-0 right-0 h-8 drag-region z-50" />

	{#if loaded}
		<div
			class="fixed bg-transparent min-h-screen w-full flex justify-center items-center font-primary z-50 text-white"
			id="auth-container"
		>
			<div
				class="w-full px-6 sm:px-10 min-h-screen flex flex-col items-center justify-center text-center"
			>
				{#if ($config?.features.auth_trusted_header ?? false) || $config?.features.auth === false}
					<div class="glass-card reveal w-full sm:max-w-md px-8 py-10">
						<div
							class="flex items-center justify-center gap-3 text-xl sm:text-2xl text-center font-secondary"
						>
							<div>
								{$i18n.t('Signing in to {{WEBUI_NAME}}', { WEBUI_NAME: 'RTL Chat' })}
							</div>

							<div>
								<Spinner className="size-5" />
							</div>
						</div>
					</div>
				{:else}
					<div class="my-auto flex flex-col justify-center items-center w-full">
						<div
							class="glass-card w-full sm:max-w-md px-7 sm:px-9 py-9 sm:py-10 text-left"
							style="transform: translate3d({mouseX * -12}px, {mouseY * -12}px, 0);"
						>
							<form
								class="flex flex-col justify-center"
								on:submit={(e) => {
									e.preventDefault();
									submitHandler();
								}}
							>
								<!-- RTL brand header: logo top-left, heading to the right -->
								<div class="flex items-center gap-3.5 mb-1 reveal" style="animation-delay: 60ms;">
									<img
										src="{WEBUI_BASE_URL}/static/rtl_logo_dark.svg"
										class="h-9 w-auto shrink-0 select-none pointer-events-none brand-logo"
										alt="RTL"
										draggable="false"
									/>
									<div class="text-2xl leading-tight font-secondary text-left">
										{#if $config?.onboarding ?? false}
											{$i18n.t(`Get started with {{WEBUI_NAME}}`, { WEBUI_NAME: 'RTL Chat' })}
										{:else if mode === 'ldap'}
											{$i18n.t(`Sign in to {{WEBUI_NAME}} with LDAP`, { WEBUI_NAME: 'RTL Chat' })}
										{:else if mode === 'signin'}
											{$i18n.t(`Sign in to {{WEBUI_NAME}}`, { WEBUI_NAME: 'RTL Chat' })}
										{:else}
											{$i18n.t(`Sign up to {{WEBUI_NAME}}`, { WEBUI_NAME: 'RTL Chat' })}
										{/if}
									</div>
								</div>

								{#if $config?.onboarding ?? false}
									<div
										class="mb-1 text-xs font-medium text-white/55 text-left reveal"
										style="animation-delay: 120ms;"
									>
										ⓘ {$WEBUI_NAME}
										{$i18n.t(
											'does not make any external connections, and your data stays securely on your locally hosted server.'
										)}
									</div>
								{/if}

								{#if $config?.features.enable_login_form || $config?.features.enable_ldap || form}
									<div class="flex flex-col mt-6 reveal" style="animation-delay: 180ms;">
										{#if mode === 'signup'}
											<div class="mb-3">
												<label for="name" class="field-label">{$i18n.t('Name')}</label>
												<div class="auth-input">
													<input
														bind:value={name}
														type="text"
														id="name"
														class="w-full text-sm bg-transparent outline-hidden placeholder:text-white/40"
														autocomplete="name"
														placeholder={$i18n.t('Enter Your Full Name')}
														required
													/>
												</div>
											</div>
										{/if}

										{#if mode === 'ldap'}
											<div class="mb-3">
												<label for="username" class="field-label">{$i18n.t('Username')}</label>
												<div class="auth-input">
													<input
														bind:value={ldapUsername}
														type="text"
														class="w-full text-sm bg-transparent outline-hidden placeholder:text-white/40"
														autocomplete="username"
														name="username"
														id="username"
														placeholder={$i18n.t('Enter Your Username')}
														required
													/>
												</div>
											</div>
										{:else}
											<div class="mb-3">
												<label for="email" class="field-label">{$i18n.t('Email')}</label>
												<div class="auth-input">
													<input
														bind:value={email}
														type="email"
														id="email"
														class="w-full text-sm bg-transparent outline-hidden placeholder:text-white/40"
														autocomplete="email"
														name="email"
														placeholder={$i18n.t('Enter Your Email')}
														required
													/>
												</div>
											</div>
										{/if}

										<div>
											<label for="password" class="field-label">{$i18n.t('Password')}</label>
											<SensitiveInput
												bind:value={password}
												type="password"
												id="password"
												outerClassName="auth-input"
												inputClassName="w-full text-sm bg-transparent outline-hidden placeholder:text-white/40"
												showButtonClassName="pl-2 transition bg-transparent text-white/50 hover:text-white"
												placeholder={$i18n.t('Enter Your Password')}
												autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
												name="password"
												screenReader={true}
												required
												aria-required="true"
											/>
										</div>

										{#if mode === 'signup' && $config?.features?.enable_signup_password_confirmation}
											<div class="mt-3">
												<label for="confirm-password" class="field-label"
													>{$i18n.t('Confirm Password')}</label
												>
												<SensitiveInput
													bind:value={confirmPassword}
													type="password"
													id="confirm-password"
													outerClassName="auth-input"
													inputClassName="w-full text-sm bg-transparent outline-hidden placeholder:text-white/40"
													showButtonClassName="pl-2 transition bg-transparent text-white/50 hover:text-white"
													placeholder={$i18n.t('Confirm Your Password')}
													autocomplete="new-password"
													name="confirm-password"
													required
												/>
											</div>
										{/if}
									</div>
								{/if}
								<div class="mt-6 reveal" style="animation-delay: 240ms;">
									{#if $config?.features.enable_login_form || $config?.features.enable_ldap || form}
										{#if mode === 'ldap'}
											<button class="btn-rtl w-full text-sm py-3" type="submit">
												{$i18n.t('Authenticate')}
											</button>
										{:else}
											<button class="btn-rtl w-full text-sm py-3" type="submit">
												{mode === 'signin'
													? $i18n.t('Sign in')
													: ($config?.onboarding ?? false)
														? $i18n.t('Create Admin Account')
														: $i18n.t('Create Account')}
											</button>

											{#if $config?.features.enable_signup && !($config?.onboarding ?? false)}
												<div class="mt-5 text-sm text-center text-white/70">
													{mode === 'signin'
														? $i18n.t("Don't have an account?")
														: $i18n.t('Already have an account?')}

													<button
														class="font-medium text-[#f15a5e] hover:text-[#ea1c22] transition underline-offset-4 hover:underline"
														type="button"
														on:click={() => {
															if (mode === 'signin') {
																mode = 'signup';
															} else {
																mode = 'signin';
															}
														}}
													>
														{mode === 'signin' ? $i18n.t('Sign up') : $i18n.t('Sign in')}
													</button>
												</div>
											{/if}
										{/if}
									{/if}
								</div>
							</form>

							{#if Object.keys($config?.oauth?.providers ?? {}).length > 0}
								<div
									class="inline-flex items-center justify-center w-full reveal"
									style="animation-delay: 300ms;"
								>
									<hr class="w-full h-px my-5 border-0 bg-white/15" />
									{#if $config?.features.enable_login_form || $config?.features.enable_ldap || form}
										<span class="px-3 text-xs uppercase tracking-widest text-white/50 bg-transparent"
											>{$i18n.t('or')}</span
										>
									{/if}

									<hr class="w-full h-px my-5 border-0 bg-white/15" />
								</div>
								<div class="flex flex-col space-y-2.5 reveal" style="animation-delay: 360ms;">
									{#if $config?.oauth?.providers?.google}
										<button
											class="btn-glass flex justify-center items-center w-full text-sm py-2.5"
											on:click={() => {
												window.location.href = `${WEBUI_BASE_URL}/oauth/google/login`;
											}}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 48 48"
												class="size-6 mr-3"
												aria-hidden="true"
											>
												<path
													fill="#EA4335"
													d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
												/><path
													fill="#4285F4"
													d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
												/><path
													fill="#FBBC05"
													d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
												/><path
													fill="#34A853"
													d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
												/><path fill="none" d="M0 0h48v48H0z" />
											</svg>
											<span>{$i18n.t('Continue with {{provider}}', { provider: 'Google' })}</span>
										</button>
									{/if}
									{#if $config?.oauth?.providers?.microsoft}
										<button
											class="btn-glass flex justify-center items-center w-full text-sm py-2.5"
											on:click={() => {
												window.location.href = `${WEBUI_BASE_URL}/oauth/microsoft/login`;
											}}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 21 21"
												class="size-6 mr-3"
												aria-hidden="true"
											>
												<rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect
													x="1"
													y="11"
													width="9"
													height="9"
													fill="#00a4ef"
												/><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect
													x="11"
													y="11"
													width="9"
													height="9"
													fill="#ffb900"
												/>
											</svg>
											<span>{$i18n.t('Continue with {{provider}}', { provider: 'Microsoft' })}</span>
										</button>
									{/if}
									{#if $config?.oauth?.providers?.github}
										<button
											class="btn-glass flex justify-center items-center w-full text-sm py-2.5"
											on:click={() => {
												window.location.href = `${WEBUI_BASE_URL}/oauth/github/login`;
											}}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												class="size-6 mr-3"
												aria-hidden="true"
											>
												<path
													fill="currentColor"
													d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.92 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57C20.565 21.795 24 17.31 24 12c0-6.63-5.37-12-12-12z"
												/>
											</svg>
											<span>{$i18n.t('Continue with {{provider}}', { provider: 'GitHub' })}</span>
										</button>
									{/if}
									{#if $config?.oauth?.providers?.oidc}
										<button
											class="btn-glass flex justify-center items-center w-full text-sm py-2.5"
											on:click={() => {
												window.location.href = `${WEBUI_BASE_URL}/oauth/oidc/login`;
											}}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="size-6 mr-3"
												aria-hidden="true"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
												/>
											</svg>

											<span
												>{$i18n.t('Continue with {{provider}}', {
													provider: $config?.oauth?.providers?.oidc ?? 'SSO'
												})}</span
											>
										</button>
									{/if}
									{#if $config?.oauth?.providers?.feishu}
										<button
											class="btn-glass flex justify-center items-center w-full text-sm py-2.5"
											on:click={() => {
												window.location.href = `${WEBUI_BASE_URL}/oauth/feishu/login`;
											}}
										>
											<span>{$i18n.t('Continue with {{provider}}', { provider: 'Feishu' })}</span>
										</button>
									{/if}
								</div>
							{/if}

							{#if $config?.features.enable_ldap && $config?.features.enable_login_form}
								<div class="mt-4">
									<button
										class="flex justify-center items-center text-xs w-full text-center text-white/60 hover:text-white transition underline-offset-4 hover:underline"
										type="button"
										on:click={() => {
											if (mode === 'ldap')
												mode = ($config?.onboarding ?? false) ? 'signup' : 'signin';
											else mode = 'ldap';
										}}
									>
										<span
											>{mode === 'ldap'
												? $i18n.t('Continue with Email')
												: $i18n.t('Continue with LDAP')}</span
										>
									</button>
								</div>
							{/if}
						</div>
						{#if $config?.metadata?.login_footer}
							<div class="max-w-3xl mx-auto reveal" style="animation-delay: 420ms;">
								<div class="mt-4 text-[0.7rem] text-white/50 marked">
									{@html DOMPurify.sanitize(marked($config?.metadata?.login_footer))}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

	{/if}
</div>

<style>
	#auth-page {
		font-family: 'Archivo', 'Vazirmatn', sans-serif;
	}

	/* ---- Parallax background ---- */
	.parallax-bg {
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		will-change: transform;
		transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
		filter: saturate(1.06) contrast(1.03);
	}

	/* ---- Vintage warm color grade ---- */
	.vintage-tint {
		background: linear-gradient(
			135deg,
			rgba(255, 170, 92, 0.2) 0%,
			rgba(120, 46, 28, 0.08) 45%,
			rgba(22, 44, 78, 0.22) 100%
		);
		mix-blend-mode: soft-light;
	}

	/* ---- Film grain ---- */
	.film-grain {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 180px 180px;
		opacity: 0.09;
		mix-blend-mode: overlay;
		animation: grain 0.7s steps(3) infinite;
	}

	@keyframes grain {
		0% {
			transform: translate(0, 0);
		}
		33% {
			transform: translate(-3%, 2%);
		}
		66% {
			transform: translate(2%, -3%);
		}
		100% {
			transform: translate(0, 0);
		}
	}

	/* ---- Vignette ---- */
	.vignette {
		background: radial-gradient(125% 100% at 50% 42%, transparent 42%, rgba(0, 0, 0, 0.6) 100%);
		box-shadow: inset 0 0 260px 50px rgba(0, 0, 0, 0.65);
	}

	/* ---- Vintage ornamental frame ---- */
	.vintage-frame {
		position: absolute;
		inset: 18px;
		z-index: 40;
		pointer-events: none;
		border: 1px solid rgba(255, 228, 196, 0.16);
		border-radius: 0;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
		will-change: transform;
		transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.corner {
		position: absolute;
		width: 26px;
		height: 26px;
		border: 1.5px solid rgba(255, 226, 188, 0.55);
	}
	.corner-tl {
		top: -1px;
		left: -1px;
		border-right: none;
		border-bottom: none;
	}
	.corner-tr {
		top: -1px;
		right: -1px;
		border-left: none;
		border-bottom: none;
	}
	.corner-bl {
		bottom: -1px;
		left: -1px;
		border-right: none;
		border-top: none;
	}
	.corner-br {
		bottom: -1px;
		right: -1px;
		border-left: none;
		border-top: none;
	}

	/* ---- Glassmorphism card ---- */
	.glass-card {
		position: relative;
		background: linear-gradient(
			160deg,
			rgba(255, 255, 255, 0.12) 0%,
			rgba(255, 255, 255, 0.04) 100%
		);
		backdrop-filter: blur(24px) saturate(150%);
		-webkit-backdrop-filter: blur(24px) saturate(150%);
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 0;
		box-shadow:
			0 32px 90px -24px rgba(0, 0, 0, 0.75),
			0 8px 32px -12px rgba(0, 0, 0, 0.5),
			inset 0 1px 0 rgba(255, 255, 255, 0.28);
		animation: cardIn 1s cubic-bezier(0.22, 1, 0.36, 1) both;
		transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
		will-change: transform;
	}

	/* top sheen */
	.glass-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 0;
		padding: 1px;
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 40%);
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
	}

	@keyframes cardIn {
		from {
			opacity: 0;
			transform: translateY(28px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.brand-logo {
		filter: none;
	}

	/* ---- Field labels ---- */
	.field-label {
		display: block;
		margin-bottom: 0.4rem;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: rgba(241, 90, 94, 0.95);
		text-align: left;
	}

	/* ---- Glass inputs ---- */
	:global(#auth-page .auth-input) {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.7rem 0.95rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 0;
		backdrop-filter: blur(6px);
		transition:
			border-color 0.25s ease,
			background 0.25s ease,
			box-shadow 0.25s ease;
	}

	:global(#auth-page .auth-input:focus-within) {
		border-color: rgba(234, 28, 34, 0.85);
		background: rgba(255, 255, 255, 0.1);
	}

	:global(#auth-page .auth-input input) {
		color: #fff;
	}

	/* ---- RTL primary button ---- */
	.btn-rtl {
		position: relative;
		overflow: hidden;
		color: #fff;
		font-weight: 600;
		border-radius: 0;
		background: linear-gradient(135deg, #ea1c22 0%, #c8161b 100%);
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			filter 0.2s ease;
	}

	.btn-rtl::after {
		content: '';
		position: absolute;
		top: 0;
		left: -120%;
		width: 60%;
		height: 100%;
		background: linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.35), transparent);
		transform: skewX(-20deg);
		transition: left 0.6s ease;
	}

	.btn-rtl:hover {
		transform: translateY(-1px);
		filter: brightness(1.06);
	}

	.btn-rtl:hover::after {
		left: 130%;
	}

	.btn-rtl:active {
		transform: translateY(0);
	}

	/* ---- Glass OAuth buttons ---- */
	.btn-glass {
		color: rgba(255, 255, 255, 0.92);
		font-weight: 500;
		border-radius: 0;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.14);
		backdrop-filter: blur(6px);
		transition:
			transform 0.2s ease,
			background 0.2s ease,
			border-color 0.2s ease;
	}

	.btn-glass:hover {
		transform: translateY(-1px);
		background: rgba(255, 255, 255, 0.13);
		border-color: rgba(255, 255, 255, 0.32);
	}

	/* ---- Staggered reveal ---- */
	.reveal {
		opacity: 0;
		animation: fadeUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	@keyframes fadeUp {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.parallax-bg,
		.vintage-frame,
		.glass-card,
		.reveal,
		.film-grain {
			animation: none !important;
			transition: none !important;
			transform: none !important;
		}
	}
</style>
