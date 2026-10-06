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
    DATA may_edit   TYPE if_abap_behv=>t_authorization.
    DATA may_delete TYPE if_abap_behv=>t_authorization.
    LOOP AT keys INTO DATA(key).
      may_edit   = COND #( WHEN zcl_sac_access=>can_edit( kind = 'CALEVENT' id = key-TaskId ) = abap_true
                           THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      may_delete = COND #( WHEN zcl_sac_access=>can_delete( kind = 'CALEVENT' id = key-TaskId ) = abap_true
                           THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      APPEND VALUE #( %tky = key-%tky %update = may_edit %delete = may_delete ) TO result.
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
