/**
 * Shared action bar for subviews. Button markup stays with its owning screen,
 * so existing form submits and delegated click handlers remain unchanged.
 * placement: 'bottom' (in-flow, sticky) or 'inline'; overview uses 'floating'.
 * count: 1 or 2, controls layout independently of labels.
 */
export function actionBar(buttons,{placement='bottom',count=2,context='generic'}={}){
 if(!['bottom','inline','floating'].includes(placement))throw new Error('Unknown action bar placement');
 if(![1,2].includes(count))throw new Error('Action bar requires one or two actions');
 const safe=String(context).replace(/[^a-z0-9-]/gi,'');
 return '<div class="ll-action-bar ll-action-bar--'+placement+' ll-action-bar--'+count+'" data-action-context="'+safe+'">'+buttons+'</div>';
}
