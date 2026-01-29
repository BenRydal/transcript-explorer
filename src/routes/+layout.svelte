<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<ToastContainer />
