//=require jquery
//=require underscore
//=require tabbii/social
//=require tabbii/defaults
//=require tabbii/internals/stack_callback
;/**
Tools for integrating Facebook.

When required, the Facebook JS SDK will be automatically, asyncronously loaded and initialized using the application configured with 
[Tabbii::Settings]

@example
  //=require tabbii/social/facebook

@namespace tabbii.social.facebook
*/
tabbii.social.facebook = (function(){
  (function(){
    // Automatically load FB SDK unless explicitly told not to.
    tabbii.on('initializing', function(){
      if(!tabbii.defaults.facebook.auto_load) return;
      facebook.init();
    });
  })();
  /** @inner */
  var facebook = {
    /**
    Callback stacks for Facebook SDK.  
    To bind to these events, `push` a callback function into them.  
    A _stack_callback_ invokes callbacks added to the stack whenever triggered, thus any function can ensure Facebook SKD is loaded before executing.
    
    
    @memberof tabbii.social.facebook
    @prop {tabbii.internals.stack_callback} loaded - triggered while the SKD is downloaded and available in the global namespace.
    @prop {tabbii.internals.stack_callback} connected - triggered when Facebook logs in a user who has authenticated with the application. Usually occurs automatically for returning users.
    @prop {tabbii.internals.stack_callback} unconnected -  triggered when Facebook checked the authorization status and found the user to not be authenticated with the app or logged out. Also triggered after a deauthorization or logout.
    @example
      function get_last_name(){
        FB.api('/me', {fields: 'last_name'}, function(response) { console.log(response); });
      }
      // Whenever the user logs in, or if they are already logged in, get_last_name will be invoked.
      tabbii.social.facebook.callbacks.connected.push(get_last_name);
    */
    callbacks : {
      loaded : new tabbii.internals.stack_callback,
      connected : new tabbii.internals.stack_callback,
      unconnected : new tabbii.internals.stack_callback
    },
    /**
    Current status from Facebook SDK. 
    Possible values: `connected`, `not_authorized` or `unknown`.
    @default
    @type {string}
    @memberof tabbii.social.facebook
    */
    status : 'unknown',
    /** 
    Load and setup the Facebook SDK.  
    Automatically invoked if `auto_load` is true.

    @memberof tabbii.social.facebook
    */
    init : function(){
      internals.load();
      // Switch between callbacks.
      facebook.callbacks.unconnected.push(function(){
        facebook.callbacks.connected.stop();
      });
      facebook.callbacks.connected.push(function(){
        facebook.callbacks.unconnected.stop();
      })
    }
  };
  var internals = {
    load : function(){
      window.fbAsyncInit = internals.init;
      (function(d, s, id, b, v, t) {
          var js, fjs = d.getElementsByTagName(s)[0],
          p = d.getElementsByTagName(b)[0], r = d.createElement(v);
          r.id = t; p.insertBefore(r, p.firstChild);
          if (d.getElementById(id)) return;
          js = d.createElement(s); js.id = id;
          js.src = "//connect.facebook.net/en_US/sdk.js";
          fjs.parentNode.insertBefore(js, fjs);
        }(document, 'script', 'facebook-jssdk', 'body', 'div', 'fb-root'));
    },
    init : function(){
      FB.init({
        appId  : tabbii.defaults.facebook.app_id,
        cookie : true,
        xfbml  : true,
        frictionlessRequests : true,
        version    : 'v2.0'
      });
      if(!tabbii.defaults.facebook.app_id) return;
      FB.getLoginStatus(internals.update_status);
      FB.Event.subscribe('auth.authResponseChange', internals.update_status);
      facebook.callbacks.loaded.trigger();
      internals.turbo.init();
    },
    update_status : function(response) {
      facebook.status = response.status;
      if(response.status=="connected") {
        facebook.callbacks.connected.trigger();
      } else {
        facebook.callbacks.unconnected.trigger();
      }
    },
    turbo : {
      init : function(){
        if(tabbii.defaults.facebook.auto_reload_widgets) {
          $(document).on('page:load', internals.reload_widgets);
        }
        if(tabbii.defaults.facebook.auto_turbo) {
          $(document).on('page:fetch', internals.turbo.save);
          $(document).on('page:change', internals.turbo.restore);
        }
      },
      save : function(){
        facebook.callbacks.loaded.stop();
        internals.turbo.fb_root = $('#fb-root').detach();
      },
      restore : function(){
        if ($('#fb-root').length > 0) {
           $('#fb-root').replaceWith(internals.turbo.fb_root);
        } else {
          $('body').append(internals.turbo.fb_root);
        }
        _.defer(facebook.callbacks.loaded.trigger);
      }
    },
    reload_widgets : function(){
      FB.XFBML.parse();
    }
  };
  /**
  Facebook tools settings.
  @memberof tabbii.social.facebook
  @default
  
  @prop {boolean} auto_load - Automatically load FB SDK when the page loads.
  @prop {boolean} auto_reload_widgets - Automatically call FB SDK to parse any widgets on the page after Turbolinks triggers a `page:load`.
  @prop {boolean} auto_turbo - Automatically reinitialize FB SDK after a Turbolinks page change.
  */
  tabbii.defaults.facebook = {
    auto_load: true,
    auto_reload_widgets: true,
    auto_turbo: true
  };
  return facebook;
})();