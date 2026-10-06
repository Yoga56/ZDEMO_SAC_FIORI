CLASS lhc_calendartask DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR calendartask RESULT result.

    METHODS setowner FOR DETERMINE ON MODIFY
      IMPORTING keys FOR calendartask~SetOwner.
ENDCLASS.

CLASS lhc_calendartask IMPLEMENTATION.

  " the owner changes and deletes an event; owners and assignees named on it (shared for editing) change it; viewers only look at it
  METHOD get_instance_authorizations.
    DATA may_edit TYPE abap_boolean.
    DATA may_delete TYPE abap_boolean.
    LOOP AT keys INTO DATA(key).
      may_edit = zcl_sac_access=>can_edit( kind = 'CALEVENT' id = key-TaskId ).
      may_delete = zcl_sac_access=>can_delete( kind = 'CALEVENT' id = key-TaskId ).
      APPEND VALUE #( %tky = key-%tky %update = COND #( WHEN may_edit = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ) %delete = COND #( WHEN may_delete = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ) ) TO result.
    ENDLOOP.
  ENDMETHOD.


  " a new event belongs to the user who creates it
  METHOD setowner.
    READ ENTITIES OF zr_sac_caltask IN LOCAL MODE
      ENTITY calendartask
        FIELDS ( OwnerId ) WITH CORRESPONDING #( keys )
      RESULT DATA(events).
    DELETE events WHERE OwnerId IS NOT INITIAL.
    CHECK events IS NOT INITIAL.
    MODIFY ENTITIES OF zr_sac_caltask IN LOCAL MODE
      ENTITY calendartask
        UPDATE FIELDS ( OwnerId )
        WITH VALUE #( FOR e IN events ( %tky = e-%tky OwnerId = zcl_sac_access=>user( ) ) ).
  ENDMETHOD.

ENDCLASS.
