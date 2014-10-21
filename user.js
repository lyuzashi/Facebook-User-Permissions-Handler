//=require jquery
//=require underscore
//=require URI
//=require tabbii/init
//=require tabbii/internals/stack_callback
//=require tabbii/social/facebook
//=require tabbii/defaults
;/**
Automatic handling of Facebook login and permissions.

The goal of this module is to allow seamless transitions between unauthenticated and authenticated states and simple task-based permission requests.

Facebook recommends that permissions only be requested when required in the app. For example, if the app provides a function to post a photo to the user's albums the `publish_actions` permission should only be requested when the user chooses to post the photo.

Permission requests are usually facilitated by a popup, therefore it is always necessary to trigger a request on an event the browser will allow to open popup windows (usually a click).

@example
  //=require tabbii/social/facebook/user

@namespace tabbii.social.facebook.user
*/
tabbii.social.facebook.user = (function($){
  var facebook = tabbii.social.facebook;
  (function(){
    tabbii.on('initializing', function(){ user.initialize() });
  })();
  /** @inner */
  var user = {
    /**
    Callback stacks for Facebook user and permissions state.  
    To bind to these events, `push` a callback function into them.  
    A _stack_callback_ invokes callbacks added to the stack whenever triggered, thus any function can ensure a Facebook user is logged in before executing.
    
    @prop {tabbii.internals.stack_callback} logged_in - triggered after Facebook connected via an implicit login.
    @prop {tabbii.internals.stack_callback} begin_login - triggered when a user initiates a login.
    @prop {tabbii.internals.stack_callback} permissions_granted - triggered when all permissions currently in `basic_permissions` and `additional_permissions` arrays are granted.
    @prop {tabbii.internals.stack_callback} permission_change - triggerd on any change in granted permissions (revocation or granting). Callbacks will be bound to an object containing two arrays, `granted` and `revoked`.
    @memberof tabbii.social.facebook.user
    */
    callbacks : {
      logged_in : new tabbii.internals.stack_callback, 
      begin_login : new tabbii.internals.stack_callback, 
      permissions_granted : new tabbii.internals.stack_callback, 
      permission_change : new tabbii.internals.stack_callback({refire:true, requeue:true})
    },
    /**
    Begins monitoring for authorization state change.  
    Automatically invoked.
    
    @memberof tabbii.social.facebook.user
    */
    initialize : function(){
      facebook.callbacks.connected.push(status.monitor);
      // Setup helpers
      helpers.deuthorize_button();
    },
    /**
    If required, opens the Facebook login dialog, requesting `basic_permissions`.  
    When called, this method will check if the user is already logged in and provides all `basic_permissions`. If this is true, the function will not open the login dialog but will trigger `callbacks.logged_in`, which should already be triggered.  
    If not directly called from a click event callback, it is likely the login dialog will fail to open.  
    jQuery will pass the trigger_event property if this method is bound directly.

    @arg {jQuery.Event} trigger_event - the event which can open a popup window.
    @memberof tabbii.social.facebook.user
    @example
      $('button').click(tabbii.social.facebook.user.login);
    */
    login : function(trigger_event){
      if(!trigger_event || !trigger_event.preventDefault) {
        console.warn("Login call not evented"); return;
      }
      trigger_event.preventDefault();
      user.callbacks.login_begin.trigger();
      // check for authorisation and permissions.
      if( user.permissions.missing(permissions.basic()).length < 1 && facebook.status=='connected' ){
        user.callbacks.logged_in.trigger();
        return;
      }
      // Otherwise
      FB.login(function(response){
        if(!response.authResponse) return false;
        user.callbacks.logged_in.trigger();
      }, {
         scope: permissions.basic() // Initially don't ask for extra permissions.
      })
    },
    /** 
     Can be used to request all extended permissions set by the app or a specific set of permissions.  
     If a callback is provided it will be triggered if the permissions are granted but not queued for later.  
     Must be called from a click event (or passed one in the first parameter).  
     The callback will not be triggered if requested permissions are not granted.  
     
     @method request_permissions
     @memberof tabbii/social/facebook/user
     @arg {jQuery.Event} trigger_event - pass the event which triggers this request
     @arg {(string|string[])} [permissions_required] - Facebook permission string or array of permissions
     @arg {tabbii.social.facebook.user.granted_callback} [granted_callback] - Called when permission(s) granted
     @memberof tabbii.social.facebook.user
     @example
       $('button').click(function(event){
         // The user will be asked to log in and provide email permissions if not already granted
         tabbii.social.facebook.user.request_permissions(event, 'email', callback);
       });
       function callback() {
         // If or when permissions are granted, the button will display data retrieved with the granted permission.
         var button = $(this.target);
         FB.api('/me', {fields: 'email'}, function(response) { button.text(response.email) });
       }
     */
    /**
     Callback from a permissions request, only called when permission is immediately granted.  
     Value of this will be the original jQuery.Event
     @this jQuery.Event
     @memberof tabbii.social.facebook.user
     @callback granted_callback
     */
    request_permissions : function(trigger_event, permissions_required, granted_callback){
      if(!trigger_event || !trigger_event.preventDefault) {
        console.warn("Login call not evented"); return;
      }
      trigger_event.preventDefault();
      if(_.isFunction(permissions_required)) {
        // permissions_required is optional.
        granted_callback = undefined;
        granted_callback = permissions_required;
        permissions_required = undefined;
      }
      var new_permissions = user.permissions.not_listed(permissions_required);
      user.permissions.add(new_permissions);
      
      var permissions = permissions_required || user.permissions.all()
      if( ! user.permissions.includes(permissions) ){
        FB.login(function(response){
          if(!response.authResponse) return false;
          status.discover(true);
          // If a callback function is set, 
          if(_.isFunction(granted_callback)) {
            // force a check for the requested or required permissions
            user.permissions.get(function(){
              // and call the callback
              if(user.permissions.includes(permissions)) 
                _.bind(granted_callback, trigger_event)();
            });
          }
        }, {
           scope: permissions,
           // Re-request, because we are asking for them, aren't we?
           auth_type: 'rerequest'
        })
      } else {
        if(_.isFunction(granted_callback)) {
          if(user.permissions.includes(permissions)) 
            _.bind(granted_callback, trigger_event)();
        }
      }
    },
    deauthorise : function(callback){
      if(!FB.getAccessToken()){
        console.log('Not logged in.');
        if('function' == typeof callback) callback(false);
        return;
      }
      jQuery.ajax({
        url:'/graph/deauthorise',
        type:'post',
        data: {access_token: FB.getAccessToken()},
        success : disconnect,
        error : disconnect,
        complete : callback
      })
    }
  }

  var status = {
    monitor : function(){
      status.discover();
      status.watch();
    },
    /**
    Requests an update of the user's status, triggering callbacks if necessary.
    
    @function update_status
    @arg {boolean} force_refresh - force status to be checked rather than using a cached value.
    @memberof tabbii.social.facebook.user
    */
    discover : function(force_fresh){
      FB.getLoginStatus(status.update, force_fresh)
    },
    watch : function(){
      FB.Event.subscribe('auth.authResponseChange', status.update);
    },
    maintain_session : (function(){
      var timer;
      var watch_and_reset = function(){
        status.discover(true);
        clearTimeout(timer);
      }
      return function(){
        if(timer) clearTimeout(timer);
        if(!FB.getAuthResponse()) return false;
        var expires_in = FB.getAuthResponse().expiresIn;
        timer = _.delay(watch_and_reset, expires_in*1000)
      }
    })(),
    update : function(response){
      facebook.status = response.status;
      status.maintain_session();
      // But always check permission changes.
      facebook.callbacks.connected.push(permissions.api.get);
    }
  }

  var permissions = (function(){
    var permissions = {
      /**
      @namespace tabbii.social.facebook.user.permissions
      */
      api : {
        /**
        All permissions that have been granted on request.
        @type string[]
        @memberof tabbii.social.facebook.user.permissions
        */
        current : new Array,
        get : function(callback){
          FB.api('me/permissions', function(response){
            update(response, callback);
          });
        },
        /**
        Checks if permission(s) are granted by the user.
        
        @arg {(string|string[])} required_permission - permission(s) to check.
        @returns {boolean} - whether all the queried permissions are granted.
        @memberof tabbii.social.facebook.user.permissions
        */
        includes : function(required_permission){
          // Looking for zero missing permissions
          return !permissions.api.missing(required_permission).length
        },
        /**
        Finds which permissions are not granted by the user.
        
        @arg {(string|string[])} required_permission - permission(s) to check.
        @returns {string[]} - permissions which are not granted.
        @memberof tabbii.social.facebook.user.permissions
        */
        missing : function(required_permission){
          var required_array = _.flatten([required_permission]);
          return _.difference(required_array, permissions.api.current);
        },
        /**
        Lists all permissions which the app could currently request. 
        
        @returns {string[]} - permissions which are possibly granted.
        @memberof tabbii.social.facebook.user.permissions
        */
        all : function(){
          return permissions.all()
        },
        /**
        Finds which permissions the app has not previously considered requesting. 
        
        @arg {(string|string[])} required_permission - permission(s) to check.
        @returns {string[]} - permissions which have not been considered yet by the app.
        @memberof tabbii.social.facebook.user.permissions
        */
        not_listed : function(required_permission){
          var required_array = _.flatten([required_permission]);
          return _.difference(required_array, permissions.api.all());
        },
        /**
        Pushes permission(s) into the `additional_permissions` array so the module may keep track of them. 
        
        @arg {(string|string[])} permissions - permission(s) to add.
        @memberof tabbii.social.facebook.user.permissions
        */
        add : function(permissions) {
          var required_array = _.flatten([permissions]);
          _.each(required_array, function(permission){
            tabbii.defaults.facebook.user.additional_permissions.push(permission);
          });
        }
      },
      basic : function(){
        return tabbii.defaults.facebook.user.basic_permissions;
      },
      additional : function(){
        return tabbii.defaults.facebook.user.additional_permissions;
      },
      all : function(){
        return _.union(permissions.additional(), permissions.basic());
      }
    }
    var update = function(raw, callback){
      permissions_object = raw.data ? raw.data : {};
      var previous_permissions = permissions.api.current;
      // Reject permissions that lack the randomly named status type of 'granted'. Thanks FB.
      // and map to flat array.
      permissions.api.current = _.map(permissions_object, function(n){if(n.status=='granted') return n.permission});
      var newly_granted = _.difference(permissions.api.current, previous_permissions);
      var newly_revoked = _.difference(previous_permissions, permissions.api.current);
      if( newly_granted.length || newly_revoked.length ){
        // should only produce callback if granted or revoked permissions include any in 
        // the full permissions set for the app  as the connected or disconnected callback
        // will handle it otherwise.
        if( _.intersection(_.union(newly_granted, newly_revoked), permissions.all()).length ){
          var permission_changes = {
            // intersect with permissions requested by app to remove irrelevant ones
            granted : _.intersection(newly_granted, permissions.all()),
            revoked : _.intersection(newly_revoked, permissions.all())
          }
          user.callbacks.permission_change.bind = permission_changes;
          user.callbacks.permission_change.trigger();
        }
      }
      // Trigger things when conditions are met
      if( user.permissions.includes( permissions.all() ) ) {
        user.callbacks.permissions_granted.trigger();
      } else {
        user.callbacks.permissions_granted.empty();
        user.callbacks.permissions_granted.stop();
        // Prevent callbacks happening later down the track.
      }
      if(_.isFunction(callback)) callback();
    }
    return permissions
  })();

  var helpers = {
    deuthorize_button : function(){
      // Automatic deauthorise prompt
      var logout_button_selector = tabbii.defaults.facebook.user.logout_button_selector;
      facebook.callbacks.connected.addTriggerEventListener(function(){
        if(logout_button_selector) $(logout_button_selector).addClass('show');
      });
      facebook.callbacks.connected.addStopEventListener(function(){
        if(logout_button_selector) $(logout_button_selector).removeClass('show');
      })
    }
  };
  // Attach internal members to public object
  $.extend(user, {
    permissions : permissions.api,
    update_status : status.discover
  }, true)

  /**
  Facebook user options.
  
  @memberof tabbii.social.facebook.user
  @default
  @prop {string[]} basic_permissions - non-extended permissions to request when the user first logs in.
  @prop {string[]} additional_permissions - extended permissions to request when required.
  @prop {string} logout_button_selector - a selector for a button which will automatically respond to user authentication status.
  */
  tabbii.defaults.facebook.user = {
    basic_permissions: [],
    additional_permissions: [],
    logout_button_selector : '#facebook_logout_button'
  }

  return user;
})(jQuery)
