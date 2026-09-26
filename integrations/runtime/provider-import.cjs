exports.load=()=>import('oidc-provider');
exports.safeLogs=provider=>{for(const event of ['error','server_error','interaction.error']){provider.removeAllListeners(event);provider.on(event,()=>console.error('OIDC_PROVIDER_ERROR='+event));}};
